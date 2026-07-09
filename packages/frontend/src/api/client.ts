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
};

const request = async <T>(url: string, options: RequestOptions = {}) => {
  const hasBody = options.body !== undefined;
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  return handleResponse<T>(response);
};

export const apiClient = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body }),
  patch: <T>(url: string, body: unknown) =>
    request<T>(url, { method: "PATCH", body }),
  put: <T>(url: string, body: unknown) =>
    request<T>(url, { method: "PUT", body }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};
