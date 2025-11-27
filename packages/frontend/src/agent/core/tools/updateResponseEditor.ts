import z from "zod";
import { tool } from "ai";
import { useResponseEditorStore } from "@/stores";

export const updateResponseEditorTool = tool({
  description:
    "Overwrite the entire PoC response editor with the provided HTML snippet.",
  inputSchema: z.object({
    html: z.string().describe("Complete HTML document to place inside the PoC"),
  }),
  execute: async ({ html }) => {
    const store = useResponseEditorStore();
    store.setContent(html, "agent");
    return {
      status: "updated",
      length: html.length,
    };
  },
});
