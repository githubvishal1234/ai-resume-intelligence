import type { components } from "@/types/api";
import { api } from "./apiClient";

export type Capabilities = components["schemas"]["CapabilitiesOut"];
export type AiUsage = components["schemas"]["AiUsageOut"];

export const systemService = {
  capabilities: () => api.get<Capabilities>("/system/capabilities"),
  aiUsage: () => api.get<AiUsage>("/ai/usage"),
};
