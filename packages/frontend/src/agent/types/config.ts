import type { AiProviderId } from "@/utils/ai";

export type ModelItem = {
  id: string;
  modelId: string;
  provider: AiProviderId;
  providerName: string;
  name: string;
};
