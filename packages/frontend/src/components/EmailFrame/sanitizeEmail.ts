import DOMPurify from "dompurify";

export type SanitizedEmail = { head: string; body: string };

export const sanitizeEmailHtml = (html: string): SanitizedEmail => {
  const root = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    RETURN_DOM: true,
    FORBID_TAGS: [
      "base",
      "button",
      "form",
      "input",
      "link",
      "meta",
      "select",
      "textarea",
    ],
    FORBID_ATTR: ["action", "formaction", "ping"],
  });
  const document = root instanceof Element ? root : undefined;
  return {
    head: document?.querySelector("head")?.innerHTML ?? "",
    body: document?.querySelector("body")?.innerHTML ?? "",
  };
};
