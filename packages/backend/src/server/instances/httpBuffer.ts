const HEADERS_SEPARATOR = new Uint8Array([13, 10, 13, 10]);
const MAX_HEADER_SIZE = 8 * 1024;
const MAX_BODY_SIZE = 32 * 1024 * 1024;

export class HttpRequestBuffer {
  private buffer: Uint8Array = new Uint8Array(0);
  private headersEndIndex: number | undefined;
  private expectedLength: number | undefined;
  private error: string | undefined;

  append(data: Uint8Array): void {
    if (this.error !== undefined) return;

    const newLength = this.buffer.length + data.length;

    if (this.headersEndIndex === undefined && newLength > MAX_HEADER_SIZE) {
      this.error = "Headers too large";
      return;
    }

    if (newLength > MAX_HEADER_SIZE + MAX_BODY_SIZE) {
      this.error = "Request too large";
      return;
    }

    const result = new Uint8Array(newLength);
    result.set(this.buffer, 0);
    result.set(data, this.buffer.length);
    this.buffer = result;

    if (this.headersEndIndex === undefined) {
      const headersEnd = this.findHeadersEnd();
      if (headersEnd !== -1) {
        this.headersEndIndex = headersEnd;
        const headerString = new TextDecoder().decode(
          this.buffer.slice(0, headersEnd),
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
  }

  isComplete(): boolean {
    if (this.headersEndIndex === undefined) {
      return false;
    }
    return this.buffer.length >= (this.expectedLength ?? 0);
  }

  hasError(): boolean {
    return this.error !== undefined;
  }

  getError(): string {
    return this.error ?? "Unknown error";
  }

  getRaw(): string {
    return new TextDecoder().decode(this.buffer);
  }

  private findHeadersEnd(): number {
    for (let i = 0; i <= this.buffer.length - HEADERS_SEPARATOR.length; i++) {
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
    return -1;
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
