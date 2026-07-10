const HEADERS_SEPARATOR = new Uint8Array([13, 10, 13, 10]);
const MAX_HEADER_SIZE = 8 * 1024;
const MAX_BODY_SIZE = 32 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_HEADER_SIZE + MAX_BODY_SIZE;

export class HttpRequestBuffer {
  private buffer: Uint8Array = new Uint8Array(0);
  private length = 0;
  private headerScanIndex = 0;
  private headersEndIndex: number | undefined;
  private expectedLength: number | undefined;
  private error: string | undefined;

  append(data: Uint8Array): void {
    if (this.error !== undefined) return;

    const newLength = this.length + data.length;
    const nextLength = Math.min(newLength, MAX_REQUEST_SIZE);
    const appendedLength = Math.max(0, nextLength - this.length);
    this.ensureCapacity(nextLength);
    this.buffer.set(data.subarray(0, appendedLength), this.length);
    this.length = nextLength;

    if (newLength > MAX_REQUEST_SIZE) {
      this.error = "Request too large";
      return;
    }

    if (this.headersEndIndex === undefined) {
      const headersEnd = this.findHeadersEnd();
      if (headersEnd === -1) {
        if (this.length > MAX_HEADER_SIZE) {
          this.error = "Headers too large";
        }
        return;
      }

      if (headersEnd > MAX_HEADER_SIZE) {
        this.error = "Headers too large";
        return;
      }

      this.headersEndIndex = headersEnd;
      const headerString = new TextDecoder().decode(
        this.buffer.subarray(0, headersEnd),
      );
      const contentLength = this.parseContentLength(headerString);

      if (contentLength !== undefined && contentLength < 0) {
        this.error = "Invalid Content-Length";
        return;
      }

      if (contentLength !== undefined && contentLength > MAX_BODY_SIZE) {
        this.error = "Body too large";
        return;
      }

      this.expectedLength = headersEnd + (contentLength ?? 0);
    }
  }

  isComplete(): boolean {
    if (this.headersEndIndex === undefined) {
      return false;
    }
    return this.length >= (this.expectedLength ?? 0);
  }

  hasError(): boolean {
    return this.error !== undefined;
  }

  getError(): string {
    return this.error ?? "Unknown error";
  }

  getRaw(): string {
    return new TextDecoder().decode(this.buffer.subarray(0, this.length));
  }

  private findHeadersEnd(): number {
    const lastStart = this.length - HEADERS_SEPARATOR.length;
    for (let i = this.headerScanIndex; i <= lastStart; i++) {
      let found = true;
      for (let j = 0; j < HEADERS_SEPARATOR.length; j++) {
        if (this.buffer[i + j] !== HEADERS_SEPARATOR[j]) {
          found = false;
          break;
        }
      }
      if (found) {
        return i + HEADERS_SEPARATOR.length;
      }
    }
    this.headerScanIndex = Math.max(
      0,
      this.length - HEADERS_SEPARATOR.length + 1,
    );
    return -1;
  }

  private ensureCapacity(requiredLength: number): void {
    if (requiredLength <= this.buffer.length) {
      return;
    }

    let capacity = Math.max(this.buffer.length, 1024);
    while (capacity < requiredLength) {
      capacity = Math.min(capacity * 2, MAX_REQUEST_SIZE);
    }

    const next = new Uint8Array(capacity);
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
  }

  private parseContentLength(headerString: string): number | undefined {
    const lines = headerString.split("\r\n");
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if (lowerLine.startsWith("content-length:")) {
        const value = line.slice("content-length:".length).trim();
        const parsed = parseInt(value, 10);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
    }
    return undefined;
  }
}
