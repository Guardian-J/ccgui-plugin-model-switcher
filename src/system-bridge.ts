import type { CliEngineId, CustomPluginChannel, SystemProviderChannel, PiFamilyApiProtocol } from "./types";
import { DEFAULT_PI_FAMILY_API, isPiFamilyApiProtocol } from "./types";
import type { PluginContext } from "./ccgui-plugin";
import { invokeHost as invokeTauri, isRemoteHost } from "./host-transport";
import {
  parsePiFamilyProviders,
  removePiFamilyProviderText,
  upsertPiFamilyProviderText,
} from "./pi-family-parser";

export interface EngineItemRule {
  id: CliEngineId;
  label: string;
  available: boolean;
  disabled: boolean;
  disabledReason?: string;
  supportedProtocols?: string[];
}

/**
 * CLI 显示名称映射
 * 对应宿主的 CLI_DISPLAY_NAMES（engine-brands.ts）
 * 保持与宿主一致，确保用户看到统一的 CLI 品牌名称
 */
export const CLI_DISPLAY_NAMES: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  grok: "Grok CLI",
  kimi: "Kimi CLI",
  pi: "PI CLI",
  omp: "OMP CLI",
  dsh: "DeepSeek Harness",
  agy: "Antigravity CLI",
  opencode: "OpenCode",
  qoder: "Qoder CLI",
  "qoder-cn": "Qoder CLI CN",
};

export const NATIVE_PROVIDER_ID = "__local_settings_json__";
/**
 * v1 配置导入留下的遗留写法，与 NATIVE_PROVIDER_ID 同义（宿主 config.rs 的
 * LEGACY_LOCAL_CONFIG_TOML_ID / is_official_provider 把两者等同看待）。
 * 读到时要接受，写回宿主时统一归一成 NATIVE_PROVIDER_ID。
 */
export const LEGACY_NATIVE_PROVIDER_ID = "__local_config_toml__";
export function independentChannelError(engine: string): string | null {
  return null;
}

const PLUGIN_PROVIDER_PREFIX = "plugin_model-switcher_";
const NATIVE_CONFIG_NAMES: Partial<Record<CliEngineId, string>> = {
  claude: "settings.json",
  codex: "config.toml · auth.json",
  kimi: "config.toml",
  grok: "config.toml",
  pi: "models.json · auth.json",
  omp: "models.yml · agent.db",
  dsh: "CLI 内置服务配置",
  agy: "CLI 内置服务配置",
  opencode: "CLI 内置服务配置",
  qoder: "CLI 内置服务配置",
  "qoder-cn": "CLI 内置服务配置",
};

export interface NativeModel {
  id: string;
  name?: string | null;
  description?: string | null;
  provider?: string;
  protocols?: string[];
}

export interface NativeCatalog {
  models: NativeModel[];
  authoritative: boolean;
}

/** CLI 原生模型目录缓存时长 (60s)，避免反复开弹窗/切 CLI 时重复启动慢速子进程 (如 omp / pi)。 */
const CATALOG_TTL_MS = 60_000;
const nativeCatalogsCache: Partial<Record<CliEngineId, { at: number; value: NativeCatalog }>> = {};
const nativeCatalogsInflight: Partial<Record<CliEngineId, Promise<NativeCatalog>>> = {};

/** 同步读取已缓存的原生模型目录，供弹窗首帧或切换 CLI 时立刻渲染。 */
export function peekNativeCatalog(engine: CliEngineId): NativeCatalog | null {
  return nativeCatalogsCache[engine]?.value ?? null;
}

/** 清理原生模型目录缓存（用于 CLI 升级或手动刷新）。 */
export function invalidateNativeCatalogCache(engine?: CliEngineId): void {
  if (engine) {
    delete nativeCatalogsCache[engine];
    delete nativeCatalogsInflight[engine];
  } else {
    for (const key of Object.keys(nativeCatalogsCache) as CliEngineId[]) {
      delete nativeCatalogsCache[key];
      delete nativeCatalogsInflight[key];
    }
  }
}

export async function getNativeCatalog(
  engine: CliEngineId,
  force = false,
): Promise<NativeCatalog> {
  if (!force) {
    const cached = nativeCatalogsCache[engine];
    if (cached && Date.now() - cached.at < CATALOG_TTL_MS) {
      return cached.value;
    }
    const inflight = nativeCatalogsInflight[engine];
    if (inflight) return inflight;
  }

  const pending = invokeTauri<NativeCatalog>("list_engine_models", { engine })
    .then((catalog) => {
      const filtered: NativeCatalog = {
        models: (catalog?.models || []).filter(
          (model) =>
            typeof model.id === "string" &&
            model.id.trim().length > 0 &&
            model.id.trim().toLowerCase() !== "default",
        ),
        authoritative: catalog?.authoritative === true,
      };
      if (nativeCatalogsInflight[engine] === pending) nativeCatalogsCache[engine] = { at: Date.now(), value: filtered };
      return filtered;
    })
    .finally(() => {
      if (nativeCatalogsInflight[engine] === pending) {
        delete nativeCatalogsInflight[engine];
      }
    });

  nativeCatalogsInflight[engine] = pending;
  return pending;
}

export async function getNativeModels(
  engine: CliEngineId,
  force = false,
): Promise<NativeModel[]> {
  return (await getNativeCatalog(engine, force)).models;
}

export function channelModelKey(
  engine: CliEngineId,
  providerId: string,
): string {
  return `${engine}:${providerId}`;
}

type HostEngineInfo = {
  id: string;
  available: boolean;
  enabled: boolean;
  supportedProtocols?: string[];
};

type CliConfigMap = Record<
  string,
  {
    providers?: Record<string, Record<string, unknown>>;
    current?: string | null;
  }
>;

/** 与宿主 npm prefix 探测缓存同量级，避免每次开弹窗都扫 PATH。 */
const ENGINES_TTL_MS = 30_000;

export const CLI_ENGINES_CHANGED_EVENT = "ccgui:cli-engines-changed";

export function notifySystemEnginesChanged(engines: EngineItemRule[]): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(CLI_ENGINES_CHANGED_EVENT, { detail: engines }),
    );
  }
}

let enginesCache: { at: number; value: EngineItemRule[] } | null = null;
let enginesInflight: Promise<EngineItemRule[]> | null = null;
let cliConfigInflight: Promise<CliConfigMap> | null = null;

export function invalidateSystemEnginesCache(): void {
  enginesCache = null;
  enginesInflight = null;
}

export function invalidateSystemSnapshot(): void {
  invalidateSystemEnginesCache();
  invalidateNativeCatalogCache();
  invalidateCliConfig();
}

function areEnginesEqual(a: EngineItemRule[], b: EngineItemRule[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const e1 = a[i];
    const e2 = b[i];
    if (
      e1.id !== e2.id ||
      e1.available !== e2.available ||
      e1.disabled !== e2.disabled ||
      e1.disabledReason !== e2.disabledReason ||
      JSON.stringify(e1.supportedProtocols) !== JSON.stringify(e2.supportedProtocols)
    ) {
      return false;
    }
  }
  return true;
}

function mapHostEngines(list: HostEngineInfo[]): EngineItemRule[] {
  return list
    .filter((e) => e.enabled)
    .map((e) => ({
      id: e.id as CliEngineId,
      label: CLI_DISPLAY_NAMES[e.id] || e.id,
      available: e.available,
      disabled: !e.available,
      disabledReason: e.available ? undefined : "未安装该引擎",
      supportedProtocols: Array.isArray(e.supportedProtocols)
        ? e.supportedProtocols.filter((p) => typeof p === "string")
        : undefined,
    }));
}

function fallbackEngines(reason: string): EngineItemRule[] {
  return Object.entries(CLI_DISPLAY_NAMES).map(([id, label]) => ({
    id: id as CliEngineId,
    label,
    available: false,
    disabled: true,
    disabledReason: reason,
  }));
}

/** 上次成功的 CLI 列表，过期也返回，供弹窗首帧立刻绘制。 */
export function peekSystemEngines(): EngineItemRule[] | null {
  return enginesCache?.value ?? null;
}

/** PATH 探测完成前的占位：当前会话 CLI 可点，其余先禁用。 */
export function optimisticSystemEngines(selected: CliEngineId): EngineItemRule[] {
  return Object.entries(CLI_DISPLAY_NAMES).map(([id, label]) => {
    const current = id === selected;
    return {
      id: id as CliEngineId,
      label,
      available: current,
      disabled: !current,
      disabledReason: current ? undefined : "正在检测安装状态…",
    };
  });
}

async function loadSystemEngines(): Promise<EngineItemRule[]> {
  try {
    const list = (await invokeTauri<HostEngineInfo[]>("list_engines")) || [];
    const mapped = mapHostEngines(list);
    const previous = enginesCache?.value;
    enginesCache = { at: Date.now(), value: mapped };
    if (!previous || !areEnginesEqual(previous, mapped)) {
      notifySystemEnginesChanged(mapped);
    }
    // 后台预热可用引擎的原生模型（特别是 omp/pi 等耗时子进程），避免点开弹窗时等待
    for (const e of mapped) {
      if (e.available && (e.id === "omp" || e.id === "pi")) {
        void getNativeCatalog(e.id).catch(() => {});
      }
    }
    return mapped;
  } catch (error) {
    console.warn(
      "[model-switcher] 读取系统 engines 失败，使用规则降级:",
      error,
    );
    return fallbackEngines("无法读取宿主 CLI 状态");
  }
}

/**
 * 获取符合项目规则的可用 CLI 列表：
 * 1. 在设置中停用（enabled === false）的 CLI 完全从列表中排除；
 * 2. 未安装二进制（available === false）的 CLI 置灰并禁用，且显示「未安装该引擎」；
 * 3. 正常安装并启用的 CLI 可正常选择并支持展示绿点。
 *
 * @param force 为 true 时穿透缓存直接请求宿主探测最新 CLI 安装与可用状态 (SWR/手动刷新/升级感知)
 */
export async function getSystemEngines(force = false): Promise<EngineItemRule[]> {
  if (!force) {
    if (enginesCache && Date.now() - enginesCache.at < ENGINES_TTL_MS) {
      return enginesCache.value;
    }
    if (enginesInflight) return enginesInflight;
  }
  const pending = loadSystemEngines().finally(() => {
    if (enginesInflight === pending) {
      enginesInflight = null;
    }
  });
  enginesInflight = pending;
  return pending;
}

/** SWR 静默后台探活：立即触发宿主 CLI 探测并在发生变化时通知 UI */
export function revalidateSystemEngines(): void {
  void getSystemEngines(true).catch(() => {});
}

export function getCliConfig(): Promise<CliConfigMap> {
  if (cliConfigInflight) return cliConfigInflight;
  const pending = invokeTauri<CliConfigMap>("get_cli_config");
  cliConfigInflight = pending;
  const clearPending = () => {
    if (cliConfigInflight === pending) cliConfigInflight = null;
  };
  void pending.then(clearPending, clearPending);
  return pending;
}

function invalidateCliConfig(): void {
  cliConfigInflight = null;
}

/** 插件激活/输入框挂载时预热 CLI 探测、供应商配置及原生模型目录，打开弹窗时尽量命中缓存。 */
export function prefetchSystemSnapshot(selectedEngine?: CliEngineId, force = false): void {
  void getSystemEngines(force).then((engines) => {
    if (selectedEngine) {
      void getNativeCatalog(selectedEngine, force).catch(() => {});
    }
    for (const e of engines) {
      if (e.available && (e.id === "omp" || e.id === "pi" || e.id === selectedEngine)) {
        void getNativeCatalog(e.id, force).catch(() => {});
      }
    }
  });
  if (force) {
    invalidateCliConfig();
  }
  void getCliConfig().catch(() => {});
}

/** 强制刷新 CLI 引擎、原生模型目录和供应商配置 */
export function refreshSystemSnapshot(selectedEngine?: CliEngineId): void {
  invalidateSystemSnapshot();
  prefetchSystemSnapshot(selectedEngine, true);
}

export interface OfficialConfigFile {
  path: string;
  format?: string;
  content: string;
  exists?: boolean;
}

export interface NativeOfficialFields {
  baseUrl: string;
  apiKey: string;
  model: string;
  api?: PiFamilyApiProtocol;
}

const EMPTY_NATIVE_FIELDS: NativeOfficialFields = {
  baseUrl: "",
  apiKey: "",
  model: "",
};

function fileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1).toLowerCase();
}

function fileContent(files: OfficialConfigFile[], name: string): string {
  return files.find((file) => fileName(file.path) === name)?.content ?? "";
}

function jsonEnv(content: string, keys: string[]): string {
  try {
    const env = (JSON.parse(content) as { env?: Record<string, unknown> })?.env;
    if (!env || typeof env !== "object") return "";
    for (const key of keys) {
      const value = env[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  } catch {
    // 原生文件可能缺省或尚未写成 JSON
  }
  return "";
}

function jsonField(content: string, key: string): string {
  try {
    const value = (JSON.parse(content) as Record<string, unknown>)?.[key];
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function tomlQuoted(content: string, key: string): string {
  const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"));
  return match?.[1] ?? "";
}

function firstTomlQuoted(content: string, keys: string[]): string {
  for (const key of keys) {
    const value = tomlQuoted(content, key);
    if (value) return value;
  }
  return "";
}

/**
 * 从宿主 official_config_read 返回的原生文件中抽出查看用的 URL / Key / 模型。
 * 非当前原生渠道时，读到的是 CLI 文件当前内容（可能是已应用的供应商补丁）。
 */
export function parseNativeOfficialFields(
  engine: CliEngineId,
  files: OfficialConfigFile[],
): NativeOfficialFields {
  switch (engine) {
    case "claude": {
      const content = fileContent(files, "settings.json");
      return {
        baseUrl: jsonEnv(content, ["ANTHROPIC_BASE_URL"]),
        apiKey: jsonEnv(content, ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"]),
        model: jsonEnv(content, ["ANTHROPIC_MODEL"]),
      };
    }
    case "codex": {
      const toml = fileContent(files, "config.toml");
      const auth = fileContent(files, "auth.json");
      return {
        baseUrl: tomlQuoted(toml, "base_url"),
        apiKey: jsonField(auth, "OPENAI_API_KEY"),
        model: tomlQuoted(toml, "model"),
      };
    }
    case "kimi": {
      const toml = fileContent(files, "config.toml");
      return {
        baseUrl: tomlQuoted(toml, "base_url"),
        apiKey: tomlQuoted(toml, "api_key"),
        model: tomlQuoted(toml, "model") || tomlQuoted(toml, "default_model"),
      };
    }
    case "grok": {
      const toml = fileContent(files, "config.toml");
      return {
        baseUrl: firstTomlQuoted(toml, [
          "models_base_url",
          "xai_api_base_url",
          "base_url",
        ]),
        apiKey: tomlQuoted(toml, "api_key"),
        model: tomlQuoted(toml, "default") || tomlQuoted(toml, "model"),
      };
    }
    default:
      return { ...EMPTY_NATIVE_FIELDS };
  }
}

const NATIVE_FILE_ENGINES = new Set<CliEngineId>(["claude", "codex", "kimi", "grok"]);

async function getNativeOfficialFields(
  engine: CliEngineId,
): Promise<NativeOfficialFields> {
  if (!NATIVE_FILE_ENGINES.has(engine)) return { ...EMPTY_NATIVE_FIELDS };
  try {
    const files =
      (await invokeTauri<OfficialConfigFile[]>("official_config_read", {
        engine,
      })) || [];
    return parseNativeOfficialFields(engine, files);
  } catch {
    return { ...EMPTY_NATIVE_FIELDS };
  }
}

const PI_FAMILY_AUTH_METADATA: Record<string, { name: string; baseUrl: string; api: PiFamilyApiProtocol }> = {
  anthropic: { name: "Anthropic", baseUrl: "https://api.anthropic.com", api: "anthropic-messages" },
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1", api: "openai-responses" },
  "openai-codex": { name: "ChatGPT (Codex)", baseUrl: "https://chatgpt.com/backend-api", api: "openai-responses" },
  google: { name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com", api: "google-generative-ai" },
  deepseek: { name: "DeepSeek", baseUrl: "https://api.deepseek.com", api: "openai-completions" },
  xai: { name: "xAI (Grok)", baseUrl: "https://api.x.ai/v1", api: "openai-completions" },
  "xai-oauth": { name: "xAI (Grok)", baseUrl: "https://api.x.ai/v1", api: "openai-completions" },
  openrouter: { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", api: "openai-completions" },
  groq: { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", api: "openai-completions" },
  mistral: { name: "Mistral", baseUrl: "https://api.mistral.ai/v1", api: "openai-completions" },
  zai: { name: "ZAI Coding Plan", baseUrl: "https://open.bigmodel.cn/api/paas/v4", api: "openai-completions" },
  "zai-coding-cn": { name: "ZAI Coding Plan (China)", baseUrl: "https://open.bigmodel.cn/api/paas/v4", api: "openai-completions" },
  "kimi-coding": { name: "Kimi For Coding", baseUrl: "https://api.moonshot.cn/v1", api: "openai-completions" },
  "kimi-code": { name: "Kimi Code", baseUrl: "https://api.moonshot.cn/v1", api: "openai-completions" },
  moonshotai: { name: "Moonshot AI", baseUrl: "https://api.moonshot.cn/v1", api: "openai-completions" },
  "moonshotai-cn": { name: "Moonshot AI (China)", baseUrl: "https://api.moonshot.cn/v1", api: "openai-completions" },
  minimax: { name: "MiniMax", baseUrl: "https://api.minimax.chat/v1", api: "openai-completions" },
  "minimax-cn": { name: "MiniMax (China)", baseUrl: "https://api.minimax.chat/v1", api: "openai-completions" },
  together: { name: "Together AI", baseUrl: "https://api.together.xyz/v1", api: "openai-completions" },
  fireworks: { name: "Fireworks", baseUrl: "https://api.fireworks.ai/inference/v1", api: "openai-completions" },
  cerebras: { name: "Cerebras", baseUrl: "https://api.cerebras.ai/v1", api: "openai-completions" },
  "qwen-token-plan": { name: "Qwen Token Plan", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", api: "openai-completions" },
  "qwen-token-plan-cn": { name: "Qwen Token Plan (China)", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", api: "openai-completions" },
  "qwen-token-plan-individual": { name: "Qwen Token Plan", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", api: "openai-completions" },
  "github-copilot": { name: "GitHub Copilot", baseUrl: "https://api.githubcopilot.com", api: "anthropic-messages" },
  "azure-openai-responses": { name: "Azure OpenAI Responses", baseUrl: "", api: "openai-responses" },
  "amazon-bedrock": { name: "Amazon Bedrock", baseUrl: "", api: "anthropic-messages" },
  "cloudflare-ai-gateway": { name: "Cloudflare AI Gateway", baseUrl: "", api: "openai-completions" },
  "cloudflare-workers-ai": { name: "Cloudflare Workers AI", baseUrl: "", api: "openai-completions" },
  "vercel-ai-gateway": { name: "Vercel AI Gateway", baseUrl: "https://gateway.ai.cloudflare.com/v1", api: "openai-completions" },
  opencode: { name: "OpenCode Zen", baseUrl: "https://opencode.ai/zen/v1", api: "openai-completions" },
  "opencode-go": { name: "OpenCode Go", baseUrl: "https://opencode.ai/go/v1", api: "openai-completions" },
  huggingface: { name: "Hugging Face", baseUrl: "https://api-inference.huggingface.co/v1", api: "openai-completions" },
  baseten: { name: "Baseten", baseUrl: "https://bridge.baseten.co/v1", api: "openai-completions" },
  xiaomi: { name: "Xiaomi MiMo", baseUrl: "https://api.mimo.mi.com/v1", api: "openai-completions" },
};

/**
 * 从系统（图 2 供应商配置）中读取指定 CLI 的所有供应商渠道
 */
export async function getSystemProviderChannels(
  engine: CliEngineId,
): Promise<{ current: string | null; channels: SystemProviderChannel[] }> {
  try {
    const [config, nativeFields] = await Promise.all([
      getCliConfig(),
      getNativeOfficialFields(engine),
    ]);

    const section = config?.[engine];
    const configuredId = section?.current;
    const currentId =
      !configuredId || configuredId === LEGACY_NATIVE_PROVIDER_ID
        ? NATIVE_PROVIDER_ID
        : configuredId;
    const channels: SystemProviderChannel[] = Object.entries(
      section?.providers || {},
    )
      .filter(
        ([id]) =>
          ![
            NATIVE_PROVIDER_ID,
            LEGACY_NATIVE_PROVIDER_ID,
            "__disabled__",
          ].includes(id) && !isPluginProviderId(id),
      )
      .map(([id, raw]) => {
        const name = (raw?.name as string) || id;
        const baseUrl = (raw?.baseUrl as string) || "";
        const apiKey = (raw?.apiKey as string) || "";
        const model = (raw?.model as string) || "";
        const remark = (raw?.remark as string) || "";

        let settingsConfig = raw?.settingsConfig as Record<string, unknown>;
        // Claude CLI 所有系统渠道默认注入 attribution 和 ENABLE_TOOL_SEARCH
        if (engine === "claude") {
          settingsConfig = {
            ...settingsConfig,
            attribution: { commit: "", pr: "" },
            ENABLE_TOOL_SEARCH: "true",
          };
        }

        return {
          id,
          name,
          baseUrl,
          apiKey,
          model,
          remark,
          isCurrent: id === currentId,
          settingsConfig,
          raw,
        };
      });

    // 对于 pi 与 omp，读取 models.json / models.yml 中的 providers 配置并解析为独立供应商渠道
    if (engine === "pi" || engine === "omp") {
      try {
        const modelsRes = await invokeTauri<{
          file?: { format: string; path: string };
          text?: string;
        }>("pi_family_models_config_read", { engine });
        if (modelsRes?.text) {
          const parsedProviders = parsePiFamilyProviders(
            modelsRes.text,
            modelsRes.file?.format || (engine === "omp" ? "yaml" : "json"),
          );
          for (const [pId, pData] of Object.entries(parsedProviders)) {
            // 按 YAML key（id）收录全部供应商；plugin_ 前缀条目交给独立 tab 的插件行，不按 name 去重
            const channel: SystemProviderChannel = {
              id: pId,
              name: pData.name || pId,
              baseUrl: pData.baseUrl || "",
              apiKey: pData.apiKey || "",
              api: pData.api,
              model: pData.models?.[0]?.id || "",
              remark: `${engine === "omp" ? "models.yml" : "models.json"} · ${pData.models?.length || 0} 个模型`,
              isCurrent: pId === currentId,
              isNative: false,
              settingsConfig: {
                models: pData.models,
                api: pData.api,
              },
              raw: pData,
            };
            const existingIndex = channels.findIndex(item => item.id === pId);
            if (existingIndex < 0) channels.push(channel);
            else channels[existingIndex] = mergeYamlProviderIntoHostChannel(channels[existingIndex], channel);
          }
        }
      } catch (err) {
        console.warn(`[model-switcher] 读取 ${engine} 的 models 配置失败:`, err);
      }
    }

    // 增加兼容 pi_family_auth_list 的已授权凭证渠道
    if (engine === "pi" || engine === "omp") {
      try {
        const authRes = await invokeTauri<{
          store?: { path: string; kind: string; exists: boolean };
          providers?: Array<{
            id: string;
            envVar?: string;
            state?: string;
            maskedKey?: string;
            keySource?: string;
          }>;
          oauthProviders?: string[];
        }>("pi_family_auth_list", { engine });

        const oauthSet = new Set(authRes?.oauthProviders || []);
        for (const p of authRes?.providers || []) {
          const isConfigured = p.state === "configured";
          const isOauth = oauthSet.has(p.id);
          if (!isConfigured && !isOauth) continue;

          const meta = PI_FAMILY_AUTH_METADATA[p.id];
          const providerName = meta?.name || p.id;
          const baseUrl = meta?.baseUrl || "";
          const api = meta?.api || DEFAULT_PI_FAMILY_API;
          const apiKey = p.maskedKey || (p.envVar ? `$${p.envVar}` : (isOauth ? "OAuth 授权" : "已授权"));
          const remark = isOauth
            ? "OAuth 授权凭证"
            : (p.keySource === "envRef" ? `环境变量 · ${p.envVar}` : `${engine === "omp" ? "agent.db" : "auth.json"} · 已授权凭证`);

          const authChannel: SystemProviderChannel = {
            id: p.id,
            name: providerName,
            baseUrl,
            apiKey,
            api,
            model: "",
            remark,
            isNative: false,
            isCurrent: p.id === currentId,
            settingsConfig: {
              api,
            },
            raw: p,
          };

          const existingIndex = channels.findIndex(item => item.id === p.id);
          if (existingIndex < 0) {
            channels.push(authChannel);
          } else {
            const existing = channels[existingIndex];
            if (!existing.apiKey && apiKey) existing.apiKey = apiKey;
            if (!existing.baseUrl && baseUrl) existing.baseUrl = baseUrl;
          }
        }
      } catch (err) {
        console.warn(`[model-switcher] 读取 ${engine} 的 auth_list 凭证失败:`, err);
      }
    }

    // Every engine can return to its native account/service configuration.
    // omp / pi 去除 CLI 原生配置渠道，由已授权凭证与 models 渠道提供
    if (engine !== "omp" && engine !== "pi") {
      const nativeChannel: SystemProviderChannel = {
        id: NATIVE_PROVIDER_ID,
        name: engine === "dsh" ? "宿主服务配置" : "CLI 原生配置",
        remark: NATIVE_CONFIG_NAMES[engine],
        baseUrl: nativeFields.baseUrl,
        apiKey: nativeFields.apiKey,
        model: nativeFields.model,
        isNative: true,
        isCurrent: currentId === NATIVE_PROVIDER_ID,
      };

      // Claude CLI 原生渠道默认注入 attribution 和 ENABLE_TOOL_SEARCH
      if (engine === "claude" && nativeChannel.id === NATIVE_PROVIDER_ID) {
        nativeChannel.settingsConfig = {
          ...nativeChannel.settingsConfig,
          attribution: { commit: "", pr: "" },
          ENABLE_TOOL_SEARCH: "true",
        };
      }

      channels.unshift(nativeChannel);
    }

    const effectiveCurrentId = (engine === "omp" || engine === "pi") && currentId === NATIVE_PROVIDER_ID
      ? (channels.find(c => c.isCurrent)?.id || channels[0]?.id || null)
      : currentId;

    return { current: effectiveCurrentId, channels };
  } catch (error) {
    console.warn(
      "[model-switcher] 读取系统供应商配置失败，使用降级数据:",
      error,
    );
    return { current: null, channels: [] };
  }
}

export const CLI_CONFIG_CHANGED_EVENT = "ccgui:cli-config-changed";

export function notifyCliConfigChanged(): void {
  invalidateCliConfig();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CLI_CONFIG_CHANGED_EVENT));
  }
}

/**
 * 把宿主当前供应商切到指定渠道。
 *
 * 只改宿主自己的配置（set_current_provider 写 ProviderSection.current），不会落盘
 * 到 CLI 自己的配置文件——宿主是在 spawn 时注入环境变量。因此这里没有需要用户
 * 二次确认的破坏性写入。
 */
export async function setSystemCurrentProvider(
  engine: CliEngineId,
  providerId: string,
): Promise<void> {
  const error = independentChannelError(engine);
  if (error && providerId && ![NATIVE_PROVIDER_ID, LEGACY_NATIVE_PROVIDER_ID].includes(providerId)) throw new Error(error);
  if (engine !== "pi" && engine !== "omp") {
    await invokeTauri("set_current_provider", { engine, id: providerId });
  }
  // pi / omp 不走 set_current_provider，但配置文件已由调用方写入，缓存仍须失效
  invalidateCliConfig();
  notifyCliConfigChanged();
}

/** 独立渠道在宿主供应商列表中的 ID，避免与系统渠道冲突。 */
export function pluginProviderId(channelId: string): string {
  return `${PLUGIN_PROVIDER_PREFIX}${channelId}`;
}

export function isPluginProviderId(providerId: string): boolean {
  return providerId.startsWith(PLUGIN_PROVIDER_PREFIX);
}

/** 去掉独立渠道在 YAML/宿主里的 plugin_ 前缀，得到插件存储用的裸 id。 */
export function stripPluginProviderPrefix(providerId: string): string {
  return isPluginProviderId(providerId)
    ? providerId.slice(PLUGIN_PROVIDER_PREFIX.length)
    : providerId;
}

/**
 * 从宿主渠道的 settingsConfig 读回 CLAUDE_CODE_EFFORT_LEVEL 开关状态。
 * 与写入端（buildProviderJson 里的 env 注入）对称，供编辑/查看表单回填。
 */
export function readEnableEffortLevel(channel: SystemProviderChannel): boolean {
  const env = (channel.settingsConfig as { env?: Record<string, unknown> } | undefined)?.env;
  return typeof env?.CLAUDE_CODE_EFFORT_LEVEL === "string"
    && env.CLAUDE_CODE_EFFORT_LEVEL.trim() !== "";
}

function pluginIdAliases(id: string): string[] {
  const stripped = stripPluginProviderPrefix(id);
  return stripped === id ? [id, pluginProviderId(id)] : [id, stripped];
}

/**
 * 宿主 providers 已登记的渠道又出现在 models.yml / models.json 里时的合并策略。
 * 宿主登记过的 id 属于系统渠道：只补 YAML 带来的模型信息，保留原 name/remark/isNative，
 * 否则 remark 被改成 "models.yml · N 个模型"，会被 classifyProviderChannels 误判成独立宿主渠道。
 * @param host 宿主 providers 解析出的系统渠道
 * @param yaml 同 id 的 models.yml / models.json 供应商渠道
 * @returns 保留系统渠道身份、补齐模型信息的渠道
 */
export function mergeYamlProviderIntoHostChannel(
  host: SystemProviderChannel,
  yaml: SystemProviderChannel,
): SystemProviderChannel {
  return {
    ...host,
    baseUrl: host.baseUrl || yaml.baseUrl,
    apiKey: host.apiKey || yaml.apiKey,
    model: host.model || yaml.model,
    api: host.api || yaml.api,
    // YAML 的 models 列表垫底，宿主已有的同名字段优先
    settingsConfig: { ...yaml.settingsConfig, ...host.settingsConfig },
    raw: host.raw ?? yaml.raw,
  };
}

/**
 * 把 getSystemProviderChannels 的列表拆成三桶：
 * - 系统：CLI 原生 + 宿主供应商配置
 * - 系统·YAML：OMP/PI 写在 models.yml / models.json 里、且没有 plugin_ 前缀的供应商。
 *   这份配置属于 CLI 自己，同样算系统渠道，和上一桶合并后一起显示在「系统渠道」tab；
 *   单独返回只是为了先剔除与插件行同 id 的孪生条目（withoutPluginTwinChannels）
 * - 独立·插件 YAML：带 plugin_ 前缀的 YAML 条目（与插件存储按 id 合并，不按 name）
 */
export function classifyProviderChannels(
  channels: SystemProviderChannel[],
): {
  systemChannels: SystemProviderChannel[];
  independentSystemChannels: SystemProviderChannel[];
  pluginYamlChannels: SystemProviderChannel[];
} {
  const systemChannels: SystemProviderChannel[] = [];
  const independentSystemChannels: SystemProviderChannel[] = [];
  const pluginYamlChannels: SystemProviderChannel[] = [];
  for (const ch of channels) {
    if (isPluginProviderId(ch.id)) {
      pluginYamlChannels.push(ch);
      continue;
    }
    const yamlHost = !ch.isNative && ch.id !== NATIVE_PROVIDER_ID &&
      typeof ch.remark === "string" && /models\.(yml|json)/.test(ch.remark);
    if (yamlHost) independentSystemChannels.push(ch);
    else systemChannels.push(ch);
  }
  return { systemChannels, independentSystemChannels, pluginYamlChannels };
}

/**
 * YAML 系统行去重：omp/pi 的 models.yml 里，同一个插件渠道既有 plugin_ 前缀条目，
 * 也可能留着同 id 的裸 key 条目，导致一个渠道在「独立」和「系统」两个 tab 里各显示一条。
 * 只按 id 判定重复（裸 id 与 plugin_ 前缀互为别名），只保留插件行；
 * 同名不同 id 是不同渠道，必须全部保留。
 * 宿主当前选中的 id 必须保留：activeChannel 依赖它查渠道，过滤掉会中断模型拉取。
 */
export function withoutPluginTwinChannels(
  independentChannels: SystemProviderChannel[],
  pluginChannels: { id?: string }[],
  keepId?: string | null,
): SystemProviderChannel[] {
  const twins = new Set<string>();
  for (const ch of pluginChannels) {
    if (!ch.id) continue;
    for (const alias of pluginIdAliases(ch.id)) twins.add(alias);
  }
  if (twins.size === 0) return independentChannels;
  return independentChannels.filter(ch => ch.id === keepId || !twins.has(ch.id));
}

/**
 * 独立 tab 的插件行：插件存储 ∪ YAML 中带 plugin_ 前缀的供应商。
 * 只按 id 去重（plugin_ 前缀与裸 id 视为同一条），同名不同 id 全部保留。
 */
export function mergePluginChannelsById(
  pluginChannels: CustomPluginChannel[],
  pluginYamlChannels: SystemProviderChannel[],
): CustomPluginChannel[] {
  const result: CustomPluginChannel[] = [];
  const seen = new Set<string>();
  const mark = (id: string) => {
    for (const alias of pluginIdAliases(id)) seen.add(alias);
  };
  for (const ch of pluginChannels) {
    if (!ch.id || seen.has(ch.id)) continue;
    mark(ch.id);
    result.push(ch);
  }
  for (const ch of pluginYamlChannels) {
    const id = stripPluginProviderPrefix(ch.id);
    if (!id || seen.has(ch.id) || seen.has(id)) continue;
    mark(id);
    const api = ch.api && isPiFamilyApiProtocol(ch.api) ? ch.api : undefined;
    result.push({
      id,
      name: ch.name,
      baseUrl: ch.baseUrl,
      apiKey: ch.apiKey,
      model: ch.model,
      api,
    });
  }
  return result;
}

function piFamilyProviderId(
  channel: { id: string; isPlugin?: boolean; isNative?: boolean } | null,
): string | null {
  if (!channel || channel.isNative || channel.id === NATIVE_PROVIDER_ID) return null;
  return channel.isPlugin ? pluginProviderId(channel.id) : channel.id;
}

function stripPiFamilyPrefix(
  id: string,
  channel: { id: string; isPlugin?: boolean; isNative?: boolean } | null,
): string {
  const provider = piFamilyProviderId(channel);
  if (provider && id.startsWith(`${provider}/`)) return id.slice(provider.length + 1);
  if (channel?.id && id.startsWith(`${channel.id}/`)) return id.slice(channel.id.length + 1);
  return id;
}

/**
 * omp / pi 的 --model 必须是 `供应商/模型`。独立渠道若只传裸模型 ID，
 * CLI 会落到内置 google 并报 No API key found for google。
 */
export function qualifyEngineModel(
  engine: CliEngineId,
  channel: { id: string; isPlugin?: boolean; isNative?: boolean } | null,
  model: string,
): string {
  const raw = model.trim().replace(/\[1m\]$/i, "");
  if (!raw || (engine !== "pi" && engine !== "omp")) return raw;
  const provider = piFamilyProviderId(channel);
  if (!provider) return raw;
  if (raw === provider || raw.startsWith(`${provider}/`)) return raw;
  const id = stripPiFamilyPrefix(raw, channel);
  return id ? `${provider}/${id}` : raw;
}

/** 列表展示用：去掉 omp / pi 供应商前缀，避免和目录里的裸模型 ID 对不上。 */
export function displayEngineModel(
  engine: CliEngineId,
  channel: { id: string; isPlugin?: boolean; isNative?: boolean } | null,
  model: string,
): string {
  const id = model.trim().replace(/\[1m\]$/i, "");
  if (!id || (engine !== "pi" && engine !== "omp")) return id;
  return stripPiFamilyPrefix(id, channel);
}

/** Delete by the same identity used for display, including legacy saved selectors. */
export function withoutCustomModel(
  engine: CliEngineId,
  channel: { id: string; isPlugin?: boolean; isNative?: boolean } | null,
  models: string[],
  modelId: string,
): string[] {
  const target = displayEngineModel(engine, channel, modelId);
  return models.filter(id => displayEngineModel(engine, channel, id) !== target);
}

function isPiFamilyEngine(engine: CliEngineId): engine is "pi" | "omp" {
  return engine === "pi" || engine === "omp";
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlTableKey(id: string): string {
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : tomlString(id);
}

/**
 * Codex 独立渠道必须走宿主 settingsConfig：config.toml 用 requires_openai_auth，
 * auth.json 写 OPENAI_API_KEY。只传扁平字段时宿主会写成 env_key，CLI 就会报缺环境变量。
 */
function buildCodexPluginSettingsConfig(
  providerId: string,
  channel: CustomPluginChannel,
): { config: string; auth: { OPENAI_API_KEY: string } } {
  const model = channel.model?.trim();
  const lines = ["disable_response_storage = true"];
  if (model) lines.push(`model = ${tomlString(model)}`);
  lines.push(
    `model_provider = ${tomlString(providerId)}`,
    "",
    `[model_providers.${tomlTableKey(providerId)}]`,
    `base_url = ${tomlString(channel.baseUrl.trim())}`,
    `name = ${tomlString(channel.name.trim() || "CC GUI")}`,
    "requires_openai_auth = true",
    'wire_api = "responses"',
  );
  return {
    config: `${lines.join("\n")}\n`,
    auth: { OPENAI_API_KEY: channel.apiKey },
  };
}

async function readPiFamilyModelsConfig(engine: "pi" | "omp"): Promise<{
  text: string;
  format: string;
}> {
  const modelsRes = await invokeTauri<{
    file?: { format?: string };
    text?: string;
  }>("pi_family_models_config_read", { engine });
  return {
    text: modelsRes?.text ?? "",
    format: modelsRes?.file?.format || (engine === "omp" ? "yaml" : "json"),
  };
}

/** omp / pi 独立渠道必须写入 models.yml / models.json，并带上 api 协议与 auth: apiKey（禁止 OAuth 塑形）。 */
async function applyPiFamilyPluginChannel(
  engine: "pi" | "omp",
  channel: CustomPluginChannel,
  providerId = pluginProviderId(channel.id),
): Promise<void> {
  const { text, format } = await readPiFamilyModelsConfig(engine);
  const next = upsertPiFamilyProviderText(text, format, providerId, {
    name: channel.name,
    baseUrl: channel.baseUrl,
    apiKey: channel.apiKey,
    api: isPiFamilyApiProtocol(channel.api || "") ? channel.api! : DEFAULT_PI_FAMILY_API,
    model: channel.model,
  });
  await invokeTauri("pi_family_models_config_write", { engine, text: next });
  invalidateNativeCatalogCache(engine);
}

/**
 * 当用户在 OMP / PI 选中某模型或拉取到模型列表时，确保模型记录在 models.yml / models.json 对应 provider 的 models 列表中，
 * 否则 CLI 会报 Model "provider/model" not found。
 */
export async function ensurePiFamilyModelConfigured(
  engine: CliEngineId,
  channel: { id: string; isPlugin?: boolean; baseUrl?: string; apiKey?: string; name?: string; api?: string } | null,
  modelOrModels: string | string[],
): Promise<void> {
  if (engine !== "pi" && engine !== "omp") return;
  if (!channel || !channel.id || channel.id === NATIVE_PROVIDER_ID) return;
  const inputList = Array.isArray(modelOrModels) ? modelOrModels : [modelOrModels];
  const bareModels = inputList
    .map((m) => displayEngineModel(engine, channel, m).trim())
    .filter(Boolean);
  if (bareModels.length === 0) return;

  const id = channel.isPlugin ? pluginProviderId(channel.id) : channel.id;
  if (isRemoteHost()) {
    const catalog = await getNativeCatalog(engine);
    const registered = new Set(catalog.models.map(model => model.id));
    if (bareModels.every(model => registered.has(`${id}/${model}`))) return;
  }
  try {
    const { text, format } = await readPiFamilyModelsConfig(engine);
    const providers = parsePiFamilyProviders(text, format);
    const existing = providers[id];
    const existingIds = new Set(existing?.models.map((m) => m.id) || []);
    const missing = bareModels.filter((m) => !existingIds.has(m));
    if (existing && missing.length === 0) {
      return;
    }
    const patch = {
      name: existing?.name || channel.name || channel.id,
      baseUrl: existing?.baseUrl || channel.baseUrl || "",
      apiKey: existing?.apiKey || channel.apiKey || "",
      api: isPiFamilyApiProtocol(existing?.api || channel.api || "")
        ? ((existing?.api || channel.api) as PiFamilyApiProtocol)
        : DEFAULT_PI_FAMILY_API,
      models: [...bareModels, ...(existing?.models || [])],
    };
    const next = upsertPiFamilyProviderText(text, format, id, patch);
    if (next !== text) {
      await invokeTauri("pi_family_models_config_write", { engine, text: next });
      invalidateNativeCatalogCache(engine);
    }
  } catch (err) {
    throw new Error(`写入 ${engine.toUpperCase()} 模型配置失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function deletePiFamilyYamlProvider(
  engine: "pi" | "omp",
  yamlId: string,
): Promise<void> {
  const { text, format } = await readPiFamilyModelsConfig(engine);
  const next = removePiFamilyProviderText(text, format, yamlId);
  if (next === text) return;
  await invokeTauri("pi_family_models_config_write", { engine, text: next });
  invalidateNativeCatalogCache(engine);
}

async function deletePiFamilyPluginChannel(
  engine: "pi" | "omp",
  channelId: string,
): Promise<void> {
  await deletePiFamilyYamlProvider(engine, pluginProviderId(channelId));
}

/** 删除 OMP/PI 宿主 YAML 供应商（裸 id，不加 plugin_ 前缀）。 */
export async function deleteHostProviderChannel(
  engine: CliEngineId,
  channelId: string,
): Promise<void> {
  if (isPiFamilyEngine(engine)) {
    await deletePiFamilyYamlProvider(engine, channelId);
  }
  await invokeTauri("delete_provider", { engine, id: channelId });
  invalidateCliConfig();
  notifyCliConfigChanged();
}

/**
 * 把独立渠道 upsert 到宿主供应商列表；会话绑定由调用方执行，不改写全局默认渠道。
 * Codex 附带 settingsConfig（auth.json + requires_openai_auth），omp / pi 写入 models.yml / models.json。
 * skipHostWrite=true 时（新宿主模式）跳过所有 CLI 配置文件写入和 upsert_provider，仅由调用方持久化到插件存储。
 * keepOriginalId=true 时（编辑系统渠道）使用原始 ID，不添加 plugin_model-switcher_ 前缀。
 */
export async function applyCustomPluginChannelToEngine(
  _ctx: PluginContext,
  engine: CliEngineId,
  channel: CustomPluginChannel,
  { skipHostWrite = false, keepOriginalId = false }: { skipHostWrite?: boolean; keepOriginalId?: boolean } = {},
): Promise<void> {
  const error = independentChannelError(engine);
  if (error) throw new Error(error);
  if (skipHostWrite) return;
  const id = keepOriginalId ? channel.id : pluginProviderId(channel.id);
  const json: Record<string, unknown> = {
    name: channel.name,
    baseUrl: channel.baseUrl,
    apiKey: channel.apiKey,
  };
  const model = channel.model?.trim();
  if (model) json.model = model;
  if (engine === "codex") {
    json.settingsConfig = buildCodexPluginSettingsConfig(id, channel);
  }
  // Claude CLI 独立渠道默认注入 attribution、ENABLE_TOOL_SEARCH，CLAUDE_CODE_EFFORT_LEVEL 由开关控制
  if (engine === "claude") {
    const env: Record<string, string> = {
      ENABLE_TOOL_SEARCH: "true",
    };
    // 仅当开关开启时注入 CLAUDE_CODE_EFFORT_LEVEL
    if (channel.enableEffortLevel) {
      env.CLAUDE_CODE_EFFORT_LEVEL = "max";
    }
    json.settingsConfig = {
      ...(json.settingsConfig as Record<string, unknown> || {}),
      attribution: { commit: "", pr: "" },
      env,
    };
  }
  if (isPiFamilyEngine(engine)) {
    json.api = isPiFamilyApiProtocol(channel.api || "") ? channel.api! : DEFAULT_PI_FAMILY_API;
    if (isRemoteHost()) {
      // Selecting an unchanged, already registered channel does not require
      // the models-file editor, which older remote hosts do not expose.
      const registered = (await getCliConfig())?.[engine]?.providers?.[id];
      if (registered && ["name", "baseUrl", "apiKey", "api", "model"].every(key =>
          (registered[key] || "") === (json[key] || ""))) return;
    }
    await applyPiFamilyPluginChannel(engine, { ...channel, api: json.api as CustomPluginChannel["api"] }, id);
  }
  await invokeTauri("upsert_provider", { engine, id, json });
  invalidateCliConfig();
  notifyCliConfigChanged();
}

/**
 * 删除宿主独立渠道及 OMP/PI 原生模型配置中的对应项，允许删除最后一个渠道。
 * skipHostWrite=true 时（新宿主模式）跳过所有 CLI 配置文件写入和 delete_provider，渠道记录仅存于插件存储。
 */
export async function deleteCustomPluginChannel(
  engine: CliEngineId,
  channelId: string,
  { skipHostWrite = false }: { skipHostWrite?: boolean } = {},
): Promise<void> {
  if (skipHostWrite) return;
  if (isPiFamilyEngine(engine)) {
    await deletePiFamilyPluginChannel(engine, channelId);
  }
  await invokeTauri("delete_provider", {
    engine,
    id: pluginProviderId(channelId),
  });
  invalidateCliConfig();
  notifyCliConfigChanged();
}
