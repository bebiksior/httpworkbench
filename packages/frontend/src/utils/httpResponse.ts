const MIME_TYPES: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  json: "application/json",
  xml: "application/xml",
  txt: "text/plain",
  css: "text/css",
  js: "application/javascript",
  svg: "image/svg+xml",
};

export const detectContentTypeFromFileName = (fileName: string): string => {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (extension !== "" && MIME_TYPES[extension] !== undefined) {
    return MIME_TYPES[extension];
  }

  return "text/plain";
};

const HTTP_HEADER_SEPARATOR = /\r?\n\r?\n/;
const HTTP_LINE_BREAK = /\r?\n/;
const HTML_BODY_PREFIX = /^<(!doctype html\b|html\b|[a-z][\w:-]*\b)/i;

export type ResponseBodySyntax = "html" | "json";

type HttpResponseSections = {
  headerBlock: string;
  body: string;
  bodyStart: number;
};

export const formatStaticHttpResponse = (params: {
  body: string;
  contentType: string;
}): string => {
  const { body, contentType } = params;

  return [
    "HTTP/1.1 200 OK",
    `Content-Type: ${contentType}`,
    "Access-Control-Allow-Origin: *",
    "Access-Control-Allow-Headers: *",
    "",
    body,
  ].join("\r\n");
};

export const splitHttpResponse = (
  raw: string | undefined,
): HttpResponseSections | undefined => {
  if (raw === undefined || raw === "") {
    return undefined;
  }

  const match = HTTP_HEADER_SEPARATOR.exec(raw);
  if (match?.index === undefined) {
    return undefined;
  }

  return {
    headerBlock: raw.slice(0, match.index),
    body: raw.slice(match.index + match[0].length),
    bodyStart: match.index + match[0].length,
  };
};

export const getHttpHeaderValue = (
  rawOrHeaderBlock: string | undefined,
  headerName: string,
): string | undefined => {
  if (rawOrHeaderBlock === undefined || rawOrHeaderBlock === "") {
    return undefined;
  }

  const normalizedHeaderName = headerName.toLowerCase();
  const headerBlock =
    splitHttpResponse(rawOrHeaderBlock)?.headerBlock ?? rawOrHeaderBlock;

  for (const line of headerBlock.split(HTTP_LINE_BREAK)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const currentHeaderName = line
      .slice(0, separatorIndex)
      .trim()
      .toLowerCase();
    if (currentHeaderName !== normalizedHeaderName) {
      continue;
    }

    return line.slice(separatorIndex + 1).trim();
  }

  return undefined;
};

export const getResponseBodySyntaxFromContentType = (
  contentType: string | undefined,
): ResponseBodySyntax | undefined => {
  if (contentType === undefined || contentType === "") {
    return undefined;
  }

  const mimeType = contentType.split(";")[0]?.trim().toLowerCase();
  if (mimeType === undefined || mimeType === "") {
    return undefined;
  }

  if (mimeType === "text/html" || mimeType === "application/xhtml+xml") {
    return "html";
  }

  if (mimeType === "application/json" || mimeType.endsWith("+json")) {
    return "json";
  }

  return undefined;
};

export const sniffResponseBodySyntax = (
  body: string | undefined,
): ResponseBodySyntax | undefined => {
  if (body === undefined || body === "") {
    return undefined;
  }

  const trimmed = body.trim();
  if (trimmed === "") {
    return undefined;
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // Fall through to HTML sniffing when the payload only looks JSON-like.
    }
  }

  if (HTML_BODY_PREFIX.test(trimmed)) {
    return "html";
  }

  return undefined;
};

export const detectResponseBodySyntax = (
  raw: string | undefined,
): ResponseBodySyntax | undefined => {
  const sections = splitHttpResponse(raw);
  if (sections === undefined) {
    return undefined;
  }

  const syntaxFromHeader = getResponseBodySyntaxFromContentType(
    getHttpHeaderValue(sections.headerBlock, "content-type"),
  );
  if (syntaxFromHeader !== undefined) {
    return syntaxFromHeader;
  }

  return sniffResponseBodySyntax(sections.body);
};

export const extractHttpBody = (raw: string | undefined): string => {
  const sections = splitHttpResponse(raw);
  if (sections === undefined) {
    return raw ?? "";
  }

  return sections.body;
};
