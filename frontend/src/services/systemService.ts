import type { components } from "@/types/api";
import { api } from "./apiClient";

export type Capabilities = components["schemas"]["CapabilitiesOut"];

export const systemService = {
  capabilities: () => api.get<Capabilities>("/system/capabilities"),
};
