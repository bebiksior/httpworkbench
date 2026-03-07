import {
  detectContentTypeFromFileName,
  formatStaticHttpResponse,
} from "@/utils/httpResponse";

type FileProcessResult = {
  raw: string;
  contentType: string;
};

export const useFileUpload = () => {
  const processFile = async (file: File): Promise<FileProcessResult> => {
    const content = await file.text();
    const contentType = detectContentTypeFromFileName(file.name);
    const raw = formatStaticHttpResponse({ body: content, contentType });

    return { raw, contentType };
  };

  return {
    processFile,
  };
};
