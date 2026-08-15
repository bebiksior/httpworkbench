const loopbackHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);

const parseOrigin = (value: string | undefined | null) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
};

export const isAllowedBrowserOrigin = (
  request: Request,
  frontendUrl = Bun.env.FRONTEND_URL,
) => {
  const originHeader = request.headers.get("origin");
  if (originHeader === null) {
    return true;
  }
  const origin = parseOrigin(originHeader);
  if (origin === undefined) {
    return false;
  }
  const configuredFrontend = parseOrigin(frontendUrl);
  if (configuredFrontend?.origin === origin.origin) {
    return true;
  }
  const requestUrl = new URL(request.url);
  if (requestUrl.origin === origin.origin) {
    return true;
  }
  return (
    loopbackHostnames.has(requestUrl.hostname) &&
    loopbackHostnames.has(origin.hostname)
  );
};
