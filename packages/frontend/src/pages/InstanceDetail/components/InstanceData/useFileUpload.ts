import {
  detectContentTypeFromFileName,
  formatStaticHttpResponse,
} from "@/utils/httpResponse";

export const useFileUpload = () => {
  const processFile = async (file: File): Promise<string> => {
    const content = await file.text();
    const contentType = detectContentTypeFromFileName(file.name);
    const raw = formatStaticHttpResponse({ body: content, contentType });

    return raw;
  };

  return {
    processFile,
  };
};
