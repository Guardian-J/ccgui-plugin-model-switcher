export type CliEngineId = "claude" | "codex" | "omp" | "kimi" | "grok" | "pi" | "dsh" | "agy" | "opencode" | "qoder" | "qoder-cn";

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
  /** omp / pi 自定义供应商协议 */
  api?: string;
  remark?: string;
  isNative?: boolean;
  isCurrent?: boolean;
  settingsConfig?: Record<string, unknown>;
  raw?: unknown;
}

/** pi / omp 自定义供应商的协议类型（对应 models.json / models.yml 的 api 字段） */
export const PI_FAMILY_API_PROTOCOLS = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
] as const;

export type PiFamilyApiProtocol = (typeof PI_FAMILY_API_PROTOCOLS)[number];

export const DEFAULT_PI_FAMILY_API: PiFamilyApiProtocol = "openai-completions";

export function isPiFamilyApiProtocol(value: string): value is PiFamilyApiProtocol {
  return (PI_FAMILY_API_PROTOCOLS as readonly string[]).includes(value);
}

/** 插件独立维护的自定义渠道 */
export interface CustomPluginChannel {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model?: string;
  /** omp / pi 自定义供应商必填协议；其他 CLI 忽略 */
  api?: PiFamilyApiProtocol;
  createdAt?: number;
  /** claude-cli 渠道是否注入 CLAUDE_CODE_EFFORT_LEVEL=max */
  enableEffortLevel?: boolean;
}

export const EMPTY_CHANNEL_FORM = {
  name: "",
  baseUrl: "",
  apiKey: "",
  model: "",
  api: DEFAULT_PI_FAMILY_API as string,
  enableEffortLevel: false,
};

export type ChannelFormState = typeof EMPTY_CHANNEL_FORM;

/** 对话级渠道覆盖记录，以 stableSessionKey（engine+sessionId+workspacePath）为键持久化 */
export interface SessionChannelRecord {
  selectedCli: CliEngineId;
  selectedProviderId: string;
  selectedModel: string;
  effort: EffortLevel;
  enable1MContext: boolean;
  activeChannelType?: "system" | "plugin";
  activePluginChannelId?: string;
  activeChannelName?: string;
}

export interface PluginState {
  selectedCli: CliEngineId;
  selectedProviderId: string;
  selectedModel: string;
  effort: EffortLevel;
  enable1MContext: boolean;
  customModels: Record<string, string[]>; // engine/channel -> favorites (includes manually added models)
  fetchedModels: Record<string, string[]>; // providerId -> fetched models
  pluginChannels?: Record<string, CustomPluginChannel[]>; // engineId -> CustomPluginChannel[]
  activeChannelType?: "system" | "plugin"; // 明确区分当前生效的是系统供应商还是插件独立渠道
  activePluginChannelId?: string; // 当前生效的插件独立渠道 ID
  activeChannelName?: string; // 当前生效渠道的显示名称（系统渠道或插件渠道均适用）
  sessionChannels?: Record<string, SessionChannelRecord>; // stableSessionKey -> 对话级渠道覆盖
  claudeScrubStatus?: "clean" | "unscrubbed" | "not_found" | "unknown"; // Legacy persisted field; live status always comes from a fresh check.
  /** 是否启用主题功能 */
  enableTheme?: boolean;
}
