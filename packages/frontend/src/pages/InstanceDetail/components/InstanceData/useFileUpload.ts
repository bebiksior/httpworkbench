type FileProcessResult = {
  raw: string;
  contentType: string;
};

const detectContentType = (fileName: string): string => {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  const mimeTypes: Record<string, string> = {
    html: "text/html",
    htm: "text/html",
    json: "application/json",
    xml: "application/xml",
    txt: "text/plain",
    css: "text/css",
    js: "application/javascript",
    svg: "image/svg+xml",
  };

  if (extension !== "" && mimeTypes[extension] !== undefined) {
    return mimeTypes[extension];
  }

  return "text/plain";
};

const formatHttpResponse = (contentType: string, body: string): string => {
  const statusLine = "HTTP/1.1 200 OK";
  const headers = [
    `Content-Type: ${contentType}`,
    "Access-Control-Allow-Origin: *",
    "Access-Control-Allow-Headers: *",
  ];

  return [statusLine, ...headers, "", body].join("\n");
};

export const useFileUpload = () => {
  const processFile = async (file: File): Promise<FileProcessResult> => {
    const content = await file.text();
    const contentType = detectContentType(file.name);
    const raw = formatHttpResponse(contentType, content);

    return { raw, contentType };
  };

  return {
    processFile,
  };
};
