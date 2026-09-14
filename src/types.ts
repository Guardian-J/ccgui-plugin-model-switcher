export type CliEngineId = "claude" | "codex" | "omp" | "kimi" | "grok" | "pi" | "dsh" | "agy";

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max" | "ultra";

export interface CliOption {
  id: CliEngineId;
  name: string;
  description?: string;
  available?: boolean;
}

/** 对应系统图 2 中的供应商渠道条目 */
export interface SystemProviderChannel {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  remark?: string;
  isNative?: boolean;
  isCurrent?: boolean;
  settingsConfig?: Record<string, unknown>;
  raw?: unknown;
}

/** 插件独立维护的自定义渠道 */
export interface CustomPluginChannel {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model?: string;
  createdAt?: number;
}

export interface PluginState {
  selectedCli: CliEngineId;
  selectedProviderId: string;
  selectedModel: string;
  effort: EffortLevel;
  enable1MContext: boolean;
  customModels: Record<string, string[]>; // providerId -> custom models
  fetchedModels: Record<string, string[]>; // providerId -> fetched models
  pluginChannels?: Record<string, CustomPluginChannel[]>; // engineId -> CustomPluginChannel[]
  activeChannelType?: "system" | "plugin"; // 明确区分当前生效的是系统供应商还是插件独立渠道
  activePluginChannelId?: string; // 当前生效的插件独立渠道 ID
  claudeScrubStatus?: "clean" | "unscrubbed" | "not_found" | "unknown"; // Legacy persisted field; live status always comes from a fresh check.
}
