import type { Config } from "shared";
import { apiClient } from "../client";

export const configApi = {
  get: () => apiClient.get<Config>("/api/config"),
};
