import {
  ApiError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "./errors";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage: string | undefined;

    try {
      const errorData = await response.json();
      errorMessage = errorData.error;
    } catch {
      errorMessage = undefined;
    }

    if (response.status === 404) {
      throw new NotFoundError(errorMessage);
    }
    if (response.status === 403) {
      throw new ForbiddenError(errorMessage);
    }
    if (response.status === 401) {
      throw new UnauthorizedError(errorMessage);
    }
    throw new ApiError(
      errorMessage ?? `Request failed: ${response.statusText}`,
      response.status,
      response.statusText,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: HeadersInit;
};

const request = async <T>(url: string, options: RequestOptions = {}) => {
  const hasBody = options.body !== undefined;
  const headers = new Headers(options.headers);
  if (hasBody) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  return handleResponse<T>(response);
};

export const apiClient = {
  get: <T>(url: string, headers?: HeadersInit) => request<T>(url, { headers }),
  post: <T>(url: string, body?: unknown, headers?: HeadersInit) =>
    request<T>(url, { method: "POST", body, headers }),
  patch: <T>(url: string, body: unknown, headers?: HeadersInit) =>
    request<T>(url, { method: "PATCH", body, headers }),
  put: <T>(url: string, body: unknown, headers?: HeadersInit) =>
    request<T>(url, { method: "PUT", body, headers }),
  delete: <T>(url: string, headers?: HeadersInit) =>
    request<T>(url, { method: "DELETE", headers }),
};
