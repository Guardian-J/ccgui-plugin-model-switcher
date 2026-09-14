import type { PluginState } from "./types";

export const DEFAULT_STATE: PluginState = {
  selectedCli: "claude",
  selectedProviderId: "",
  selectedModel: "",
  effort: "high",
  enable1MContext: false,
  customModels: {},
  fetchedModels: {},
};
