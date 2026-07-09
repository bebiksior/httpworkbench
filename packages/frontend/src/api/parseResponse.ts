import type { z } from "zod";
import { ValidationError } from "./errors";

export const parseResponse = <Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
  description: string,
): z.infer<Schema> => {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(
      `Invalid ${description} response: ${result.error.message}`,
    );
  }
  return result.data;
};
