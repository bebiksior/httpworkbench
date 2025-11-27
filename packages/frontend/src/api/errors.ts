export class ApiError extends Error {
  statusCode?: number;
  statusText?: string;

  constructor(message: string, statusCode?: number, statusText?: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.statusText = statusText;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Resource not found") {
    super(message, 404, "Not Found");
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Access denied") {
    super(message, 403, "Forbidden");
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized") {
    super(message, 401, "Unauthorized");
    this.name = "UnauthorizedError";
  }
}
