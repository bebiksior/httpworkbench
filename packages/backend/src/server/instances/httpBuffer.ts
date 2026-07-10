const HEADERS_SEPARATOR = new Uint8Array([13, 10, 13, 10]);
const MAX_HEADER_SIZE = 8 * 1024;
const MAX_BODY_SIZE = 32 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_HEADER_SIZE + MAX_BODY_SIZE;

type FramingResult =
  { ok: true; contentLength: number } | { ok: false; error: string };

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
      const framing = this.parseFraming(headerString);
      if (!framing.ok) {
        this.error = framing.error;
        return;
      }

      if (framing.contentLength > MAX_BODY_SIZE) {
        this.error = "Body too large";
        return;
      }

      this.expectedLength = headersEnd + framing.contentLength;
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
    const framedLength =
      this.error === undefined && this.expectedLength !== undefined
        ? Math.min(this.length, this.expectedLength)
        : this.length;
    return new TextDecoder().decode(this.buffer.subarray(0, framedLength));
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

  private parseFraming(headerString: string): FramingResult {
    const lines = headerString.split("\r\n");
    const contentLengths: number[] = [];
    let hasTransferEncoding = false;

    for (const line of lines.slice(1)) {
      if (line.startsWith(" ") || line.startsWith("\t")) {
        return {
          ok: false,
          error: "Obsolete folded headers are not supported",
        };
      }

      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) {
        continue;
      }

      const rawName = line.slice(0, separatorIndex);
      if (rawName !== rawName.trim()) {
        return { ok: false, error: "Invalid header name" };
      }
      const name = rawName.toLowerCase();
      const value = line.slice(separatorIndex + 1).trim();
      if (name === "transfer-encoding") {
        hasTransferEncoding = true;
        continue;
      }
      if (name !== "content-length") {
        continue;
      }

      for (const candidate of value.split(",")) {
        const normalized = candidate.trim();
        if (!/^\d+$/.test(normalized)) {
          return { ok: false, error: "Invalid Content-Length" };
        }
        const parsed = Number(normalized);
        if (!Number.isSafeInteger(parsed)) {
          return { ok: false, error: "Invalid Content-Length" };
        }
        contentLengths.push(parsed);
      }
    }

    if (hasTransferEncoding) {
      return {
        ok: false,
        error:
          contentLengths.length === 0
            ? "Transfer-Encoding is not supported"
            : "Conflicting Transfer-Encoding and Content-Length",
      };
    }

    const contentLength = contentLengths[0] ?? 0;
    if (contentLengths.some((value) => value !== contentLength)) {
      return { ok: false, error: "Conflicting Content-Length headers" };
    }
    return { ok: true, contentLength };
  }
}
