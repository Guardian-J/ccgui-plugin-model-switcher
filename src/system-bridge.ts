import type { CliEngineId, SystemProviderChannel } from "./types";
import type { PluginContext } from "./ccgui-plugin";
import { parsePiFamilyProviders } from "./pi-family-parser";

interface TauriInternals {
  invoke?: (cmd: string, args?: unknown) => Promise<unknown>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

export interface EngineItemRule {
  id: CliEngineId;
  label: string;
  available: boolean;
  disabled: boolean;
  disabledReason?: string;
  supportedProtocols?: string[];
}

export const CLI_DISPLAY_NAMES: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  grok: "Grok CLI",
  kimi: "Kimi CLI",
  pi: "PI CLI",
  omp: "OMP CLI",
  dsh: "DeepSeek Harness",
  agy: "Antigravity CLI",
};

export const NATIVE_PROVIDER_ID = "__local_settings_json__";
const PLUGIN_PROVIDER_PREFIX = "plugin_model-switcher_";
const NATIVE_CONFIG_NAMES: Partial<Record<CliEngineId, string>> = {
  claude: "settings.json",
  codex: "config.toml · auth.json",
  kimi: "config.toml",
  grok: "config.toml",
  pi: "models.json · auth.json",
  omp: "models.yml · agent.db",
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
      nativeCatalogsCache[engine] = { at: Date.now(), value: filtered };
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

/**
 * 安全调用 Tauri IPC。宿主 hardening 用同步 pluginDepth 拦截插件栈上的 invoke；
 * 微任务后 depth 已归零。React 点击/effect 本身已脱出，微任务几乎无额外等待。
 */
async function invokeTauri<T>(
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const internals = window.__TAURI_INTERNALS__;
  if (!internals?.invoke) {
    throw new Error("当前环境未检测到 Tauri 宿主 IPC 接口");
  }
  return (await Promise.resolve().then(() => internals.invoke!(cmd, args))) as T;
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

function getCliConfig(): Promise<CliConfigMap> {
  if (cliConfigInflight) return cliConfigInflight;
  const pending = invokeTauri<CliConfigMap>("get_cli_config");
  cliConfigInflight = pending;
  void pending.finally(() => {
    if (cliConfigInflight === pending) cliConfigInflight = null;
  });
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
    let currentId =
      !configuredId || configuredId === "__local_config_toml__"
        ? engine === "dsh"
          ? null
          : NATIVE_PROVIDER_ID
        : configuredId;
    const channels: SystemProviderChannel[] = Object.entries(
      section?.providers || {},
    )
      .filter(
        ([id]) =>
          ![
            NATIVE_PROVIDER_ID,
            "__local_config_toml__",
            "__disabled__",
          ].includes(id) && !isPluginProviderId(id),
      )
      .map(([id, raw]) => {
        const name = (raw?.name as string) || id;
        const baseUrl = (raw?.baseUrl as string) || "";
        const apiKey = (raw?.apiKey as string) || "";
        const model = (raw?.model as string) || "";
        const remark = (raw?.remark as string) || "";

        return {
          id,
          name,
          baseUrl,
          apiKey,
          model,
          remark,
          isCurrent: id === currentId,
          settingsConfig: raw?.settingsConfig as Record<string, unknown>,
          raw,
        };
      });

    // 对于 pi 与 omp，读取 models.json / models.yml 中的 providers 配置并解析为独立供应商渠道
    let piFamilyProviderCount = 0;
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
            piFamilyProviderCount++;
            channels.push({
              id: pId,
              name: pData.name || pId,
              baseUrl: pData.baseUrl || "",
              apiKey: pData.apiKey || "",
              model: pData.models?.[0]?.id || "",
              remark: `${engine === "omp" ? "models.yml" : "models.json"} · ${pData.models?.length || 0} 个模型`,
              isCurrent: pId === currentId,
              settingsConfig: {
                models: pData.models,
                api: pData.api,
              },
              raw: pData,
            });
          }
        }
      } catch (err) {
        console.warn(`[model-switcher] 读取 ${engine} 的 models 配置失败:`, err);
      }
    }

    // 只有在非 dsh 且 (非 pi/omp 或 pi/omp 未定义自定义 providers) 时才插入默认的 "CLI 原生配置" 占位
    if (engine !== "dsh" && ((engine !== "pi" && engine !== "omp") || piFamilyProviderCount === 0)) {
      channels.unshift({
        id: NATIVE_PROVIDER_ID,
        name: "CLI 原生配置",
        remark: NATIVE_CONFIG_NAMES[engine],
        baseUrl: nativeFields.baseUrl,
        apiKey: nativeFields.apiKey,
        model: nativeFields.model,
        isNative: true,
        isCurrent: currentId === NATIVE_PROVIDER_ID,
      });
    } else if ((engine === "pi" || engine === "omp") && piFamilyProviderCount > 0 && currentId === NATIVE_PROVIDER_ID) {
      // 若已解析出独立渠道且当前为默认占位，自动指向首个渠道
      currentId = channels[0]?.id || NATIVE_PROVIDER_ID;
      if (channels[0]) {
        channels[0].isCurrent = true;
      }
    }

    return { current: currentId, channels };
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
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CLI_CONFIG_CHANGED_EVENT));
  }
}

/**
 * 把宿主当前供应商切到指定渠道。Claude/Codex/Kimi/Grok 会经 provider_files::apply
 * 改写 settings.json / config.toml / auth.json，与宿主设置页渠道切换相同。
 */
export async function setSystemCurrentProvider(
  engine: CliEngineId,
  providerId: string,
): Promise<void> {
  if (engine !== "pi" && engine !== "omp") {
    await invokeTauri("set_current_provider", { engine, id: providerId });
    invalidateCliConfig();
  }
  notifyCliConfigChanged();
}

/** 独立渠道在宿主供应商列表中的 ID，避免与系统渠道冲突。 */
export function pluginProviderId(channelId: string): string {
  return `${PLUGIN_PROVIDER_PREFIX}${channelId}`;
}

export function isPluginProviderId(providerId: string): boolean {
  return providerId.startsWith(PLUGIN_PROVIDER_PREFIX);
}

/**
 * 把独立渠道 upsert 到宿主供应商列表并设为当前项，随后对话使用该渠道的 URL/Key。
 */
export async function applyCustomPluginChannelToEngine(
  _ctx: PluginContext,
  engine: CliEngineId,
  channel: { id: string; name: string; baseUrl: string; apiKey: string; model?: string },
): Promise<void> {
  const id = pluginProviderId(channel.id);
  const json: Record<string, string> = {
    name: channel.name,
    baseUrl: channel.baseUrl,
    apiKey: channel.apiKey,
  };
  const model = channel.model?.trim();
  if (model) json.model = model;
  await invokeTauri("upsert_provider", { engine, id, json });
  await invokeTauri("set_current_provider", { engine, id });
  invalidateCliConfig();
  notifyCliConfigChanged();
}

/**
 * 从宿主供应商列表删除独立渠道。若该渠道是当前项，宿主会把 CLI 文件恢复成官方备份。
 */
export async function deleteCustomPluginChannel(
  engine: CliEngineId,
  channelId: string,
): Promise<void> {
  await invokeTauri("delete_provider", {
    engine,
    id: pluginProviderId(channelId),
  });
  invalidateCliConfig();
  notifyCliConfigChanged();
}
