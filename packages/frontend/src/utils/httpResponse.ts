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
  ].join("\n");
};

export const extractHttpBody = (raw: string | undefined): string => {
  if (raw === undefined || raw === "") {
    return "";
  }

  const match = /\r?\n\r?\n/.exec(raw);
  if (match?.index === undefined) {
    return raw;
  }

  return raw.slice(match.index + match[0].length);
};
