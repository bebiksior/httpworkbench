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

export const apiClient = {
  get: async <T>(url: string): Promise<T> => {
    const response = await fetch(`${url}`, {
      credentials: "include",
    });
    return handleResponse<T>(response);
  },

  post: async <T>(url: string, body: unknown): Promise<T> => {
    const response = await fetch(`${url}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  patch: async <T>(url: string, body: unknown): Promise<T> => {
    const response = await fetch(`${url}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  put: async <T>(url: string, body: unknown): Promise<T> => {
    const response = await fetch(`${url}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  delete: async <T>(url: string): Promise<T> => {
    const response = await fetch(`${url}`, {
      method: "DELETE",
      credentials: "include",
    });
    return handleResponse<T>(response);
  },
};
