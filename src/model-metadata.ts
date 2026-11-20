import type { PluginContext } from "./ccgui-plugin";
import { fetchProviderModelEntries } from "./api";

export interface ModelMetadata {
  contextWindow?: number;
  maxTokens?: number;
}

export interface ModelMetadataQuery {
  providerId: string;
  modelId: string;
  baseUrl?: string;
  knownContextWindow?: number;
  force?: boolean;
}

interface OpenRouterEntry {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  max_completion_tokens?: unknown;
  top_provider?: {
    context_length?: unknown;
    max_completion_tokens?: unknown;
  };
}

interface OpenRouterCatalog {
  data?: OpenRouterEntry[];
}

interface CachedModelMetadata extends ModelMetadata {
  fetchedAt: number;
  source?: string;
}

interface OpenRouterMatch extends ModelMetadata {
  vendor: string;
  modelId: string;
  score: number;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/models";
const MODEL_METADATA_TTL_MS = 24 * 60 * 60 * 1000;
let catalogCache: OpenRouterEntry[] | null = null;
let catalogExpiresAt = 0;
let catalogPromise: Promise<OpenRouterEntry[] | null> | null = null;

export function modelMetadataCacheKey(providerId: string, modelId: string): string {
  return `model-metadata:${providerId.trim()}:${normalizeMetadataModelId(modelId)}`;
}

export function normalizeMetadataModelId(modelId: string): string {
  return modelId.trim().replace(/\[1m\]$/i, "").toLowerCase();
}

function positiveInteger(value: unknown): number | undefined {
  const numeric = typeof value === "string"
    ? Number(value.trim().replace(/[,_(+\s]/g, "").replace(/\)$/, ""))
    : typeof value === "number" ? value : Number.NaN;
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : undefined;
}

function providerIdAliases(providerId: string): string[] {
  const raw = providerId.trim().toLowerCase().replace(/^plugin_model-switcher_/, "");
  if (/^custom_\d+$/.test(raw)) return [];
  return [raw];
}

function baseUrlAliases(baseUrl?: string): string[] {
  try {
    const host = new URL(String(baseUrl).trim().toLowerCase()).hostname;
    if (host.includes("openai.com")) return ["openai", "chatgpt"];
    if (host.includes("anthropic.com")) return ["anthropic"];
    if (host.includes("deepseek.com")) return ["deepseek"];
    if (host.includes("moonshot")) return ["moonshotai", "moonshot"];
    if (host.includes("x.ai") || host.includes("xai")) return ["x-ai", "xai", "grok"];
    if (host.includes("openrouter.ai")) return ["openrouter"];
    if (host.includes("groq.com")) return ["groq"];
    if (host.includes("siliconflow.cn")) return ["siliconflow"];
    if (host.includes("aliyuncs.com")) return ["alibaba", "qwen"];
    if (host.includes("volces.com")) return ["bytedance", "doubao"];
    if (host.includes("minimax")) return ["minimax"];
    if (host.includes("z.ai") || host.includes("zhipuai")) return ["z-ai", "glm", "zhipu"];
    if (host.includes("kimi")) return ["moonshotai", "kimi"];
    if (host.includes("gemini") || host.includes("generativelanguage")) return ["google"];
  } catch {
    // Relay Base URLs are user input; only known vendors become metadata aliases.
  }
  return [];
}

// 归一模型名：去掉网关路由前缀标签（[Cloud]/[AN] 等）、1M 标记与多余空白，便于跨目录匹配。
function cleanForMatch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function entryContext(entry: OpenRouterEntry): number | undefined {
  return positiveInteger(entry.context_length ?? entry.top_provider?.context_length);
}

function entryMaxTokens(entry: OpenRouterEntry): number | undefined {
  return positiveInteger(entry.top_provider?.max_completion_tokens ?? entry.max_completion_tokens);
}

export function lookupOpenRouterMetadata(
  entries: OpenRouterEntry[] | null,
  query: Pick<ModelMetadataQuery, "providerId" | "modelId" | "baseUrl" | "knownContextWindow">,
): ModelMetadata | null {
  if (!entries || entries.length === 0) return null;
  const target = cleanForMatch(query.modelId);
  if (!target) return null;
  const vendorHints = new Set([...providerIdAliases(query.providerId), ...baseUrlAliases(query.baseUrl)]);

  const matches: OpenRouterMatch[] = [];
  for (const entry of entries) {
    const full = cleanForMatch(entry.id ?? entry.name);
    if (!full) continue;
    const segments = full.split("/");
    const last = segments[segments.length - 1] ?? "";
    const vendor = segments.length > 1 ? segments.slice(0, -1).join("/") : "";
    let score = 0;
    if (full === target) score = 3;
    else if (last === target) score = 2;
    else if (full.endsWith(`/${target}`)) score = 2;
    else if (target.endsWith(`/${last}`)) score = 1;
    if (score === 0) continue;
    const contextWindow = entryContext(entry);
    const maxTokens = entryMaxTokens(entry);
    if (contextWindow === undefined && maxTokens === undefined) continue;
    let adjusted = score;
    if (vendor && vendorHints.has(vendor)) adjusted += 0.5;
    matches.push({ vendor, modelId: last, score: adjusted, contextWindow, maxTokens });
  }
  if (matches.length === 0) return null;

  let candidates = matches;
  if (query.knownContextWindow !== undefined) {
    const exact = candidates.filter((match) => match.contextWindow === query.knownContextWindow);
    if (exact.length > 0) candidates = exact;
  }
  const topScore = Math.max(...candidates.map((match) => match.score));
  const top = candidates.filter((match) => match.score === topScore);
  // 同名模型跨厂商版本仍歧义时不臆测，交由本地配置/native/手动覆盖处理。
  if (new Set(top.map((match) => `${match.contextWindow}/${match.maxTokens}`)).size > 1) return null;

  const best = top[0];
  return { contextWindow: best.contextWindow, maxTokens: best.maxTokens };
}

function unwrapBridgeBody(response: { status: number; body: string }): OpenRouterCatalog {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}`);
  }
  return JSON.parse(response.body) as OpenRouterCatalog;
}

async function loadOpenRouterCatalog(ctx: PluginContext, force: boolean): Promise<OpenRouterEntry[] | null> {
  if (!force) {
    if (catalogCache && catalogExpiresAt > Date.now()) return catalogCache;
    if (catalogPromise) return catalogPromise;
  }

  const pending = ctx.bridge.invoke<{ status: number; body: string }>("plugin_http_request", {
    method: "GET",
    url: OPENROUTER_URL,
    headers: { Accept: "application/json" },
  }).then(unwrapBridgeBody).then((catalog) => {
    catalogCache = Array.isArray(catalog?.data) ? catalog.data : [];
    catalogExpiresAt = Date.now() + MODEL_METADATA_TTL_MS;
    return catalogCache;
  }).catch((error) => {
    console.warn("[model-switcher] 读取 OpenRouter 模型元数据失败:", error);
    catalogCache = null;
    catalogExpiresAt = 0;
    return null;
  }).finally(() => {
    if (catalogPromise === pending) catalogPromise = null;
  });
  catalogPromise = pending;
  return pending;
}

function readStorageMetadata(value: unknown): CachedModelMetadata | null {
  if (!value || typeof value !== "object") return null;
  const cached = value as Partial<CachedModelMetadata>;
  if (typeof cached.fetchedAt !== "number" || Date.now() - cached.fetchedAt > MODEL_METADATA_TTL_MS) return null;

  const contextWindow = positiveInteger(cached.contextWindow);
  const maxTokens = positiveInteger(cached.maxTokens);
  if (contextWindow === undefined && maxTokens === undefined) return null;
  return {
    fetchedAt: cached.fetchedAt,
    source: cached.source,
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
  };
}

export async function queryModelMetadata(
  ctx: PluginContext,
  query: ModelMetadataQuery,
): Promise<ModelMetadata | null> {
  const cacheKey = modelMetadataCacheKey(query.providerId, query.modelId);
  try {
    if (!query.force) {
      const cached = readStorageMetadata(await ctx.storage.get<CachedModelMetadata>(cacheKey));
      if (cached) return { contextWindow: cached.contextWindow, maxTokens: cached.maxTokens };
    }
  } catch {
    // A failing cache must not block metadata lookup.
  }

  const catalog = await loadOpenRouterCatalog(ctx, query.force === true);
  const metadata = lookupOpenRouterMetadata(catalog, query);
  if (!metadata) return null;

  try {
    await ctx.storage.set(cacheKey, {
      ...metadata,
      fetchedAt: Date.now(),
      source: "openrouter",
    } satisfies CachedModelMetadata);
  } catch {
    // Storage failures still return this turn's metadata.
  }
  return metadata;
}

export interface ProviderModelMetadataQuery {
  baseUrl?: string;
  apiKey?: string;
  modelId: string;
}

/**
 * 从渠道自己的模型列表接口（/v1/models 等）读取上下文窗口与最大输出。
 * 部分聚合网关会在模型条目里直接携带 context_window/max_tokens/limit 字段，
 * 命中即可省去 OpenRouter 目录查询；取不到时返回 null，由调用方继续兜底。
 */
export async function queryProviderModelMetadata(
  ctx: PluginContext,
  query: ProviderModelMetadataQuery,
): Promise<ModelMetadata | null> {
  if (!query.baseUrl) return null;
  const selected = normalizeMetadataModelId(query.modelId);
  if (!selected) return null;
  try {
    const entries = await fetchProviderModelEntries(ctx, query.baseUrl, query.apiKey ?? "");
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const rawId = record.id ?? record.name;
      if (typeof rawId !== "string") continue;
      const normalized = normalizeMetadataModelId(rawId);
      if (normalized !== selected && !normalized.endsWith(`/${selected}`)) continue;
      const limit = (record.limit && typeof record.limit === "object" ? record.limit : {}) as Record<string, unknown>;
      const contextWindow = positiveInteger(
        record.contextWindow ?? record.context_window ?? record.max_context_length ?? record.maxContextLength
          ?? limit.context ?? limit.contextWindow ?? limit.context_window,
      );
      const maxTokens = positiveInteger(
        record.maxTokens ?? record.max_tokens ?? record.max_output_tokens ?? record.maxOutputTokens
          ?? limit.output ?? limit.maxTokens ?? limit.max_tokens ?? limit.maxOutputTokens,
      );
      if (contextWindow !== undefined || maxTokens !== undefined) return { contextWindow, maxTokens };
    }
    return null;
  } catch (error) {
    console.warn("[model-switcher] 从模型接口读取元数据失败:", error);
    return null;
  }
}
