const remoteContentPattern =
  /\b(?:src|background|poster)\s*=\s*["']?\s*(?:https?:)?\/\/|url\(\s*["']?\s*(?:https?:)?\/\//i;

export const hasRemoteContent = (html: string) =>
  remoteContentPattern.test(html);

export const emailDocument = (
  email: { head: string; body: string },
  allowRemote: boolean,
) => {
  const remote = allowRemote ? " https: http:" : "";
  const policy = [
    "default-src 'none'",
    `img-src data:${remote}`,
    `style-src 'unsafe-inline'${remote}`,
    `font-src data:${remote}`,
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><base target="_blank"><style>html{color-scheme:light}body{margin:0;padding:20px;font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:#18181b;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>${email.head}</head><body>${email.body}</body></html>`;
};
