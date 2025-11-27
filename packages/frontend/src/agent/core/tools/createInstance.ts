import z from "zod";
import { tool } from "ai";
import type { Instance } from "shared";
import { instancesApi } from "@/api/domains/instances";
import { ApiError, ValidationError } from "@/api/errors";
import { config } from "@/config";
import { useAuthStore } from "@/stores";

const createHtmlResponse = (html: string) => {
  return [
    "HTTP/1.1 200 OK",
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
  ].join("\r\n");
};

const createInstancePayloadSchema = z.object({
  type: z.enum(["raw", "html"]).describe("Type of content to create"),
  text: z
    .string()
    .min(1, "Provide the content text.")
    .describe(
      "For 'raw': Full raw HTTP response including status line, headers, blank line, and body. For 'html': Plain HTML document that will be wrapped in an HTTP response.",
    ),
});

type CreateInstanceToolInput = z.infer<typeof createInstancePayloadSchema>;

const buildRawPayload = (input: CreateInstanceToolInput) => {
  if (input.type === "html") {
    return createHtmlResponse(input.text);
  }
  return input.text;
};

const createStaticInstance = async (raw: string): Promise<Instance> => {
  const authStore = useAuthStore();

  const isGuest = authStore.isGuest === true;
  if (isGuest) {
    throw new Error("Guest shouldn't have access to this feature.");
  }

  return instancesApi.create({ kind: "static", raw });
};

const getToolErrorMessage = (error: unknown) => {
  if (error instanceof ValidationError || error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error while creating instance.";
};

export const createInstanceTool = tool({
  description: "Create a new HTTP instance that serves the provided payload.",
  inputSchema: createInstancePayloadSchema,
  execute: async ({ text, type }: CreateInstanceToolInput) => {
    try {
      const raw = buildRawPayload({ text, type });
      const instance = await createStaticInstance(raw);
      const url = config.getInstanceUrl(instance.id);

      return {
        status: "created",
        url,
        instance,
      };
    } catch (error) {
      return {
        status: "error",
        error: getToolErrorMessage(error),
      };
    }
  },
});
