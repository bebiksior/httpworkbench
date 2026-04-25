import {
  detectResponseBodySyntax,
  sniffResponseBodySyntax,
  splitHttpResponse,
  type ResponseBodySyntax,
} from "@/utils/httpResponse";

type ResponseBodySyntaxSource = {
  syntax: ResponseBodySyntax;
  body: string;
  bodyStart: number;
};

export const getResponseBodySyntaxSource = (
  raw: string,
): ResponseBodySyntaxSource | undefined => {
  const sections = splitHttpResponse(raw);
  if (sections !== undefined) {
    const syntax = detectResponseBodySyntax(raw);
    if (syntax === undefined || sections.body === "") {
      return undefined;
    }

    return {
      syntax,
      body: sections.body,
      bodyStart: sections.bodyStart,
    };
  }

  const syntax = sniffResponseBodySyntax(raw);
  if (syntax === undefined) {
    return undefined;
  }

  return {
    syntax,
    body: raw,
    bodyStart: 0,
  };
};
