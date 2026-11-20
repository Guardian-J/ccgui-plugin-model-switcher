import type { PluginContext } from "./ccgui-plugin";
import type { CliEngineId } from "./types";
import { getNativeCatalog, type NativeCatalog } from "./system-bridge";
import { invokeHost, isRemoteHost } from "./host-transport";

export interface FetchedModelItem {
  id: string;
  owned_by?: string;
}

interface ProviderModelList {
  models?: unknown[];
  data?: unknown[];
  endpoint: string;
}

function normalizeModelIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => typeof item === "string" ? item :
    item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"
      ? (item as { id: string }).id : "").filter(Boolean);
}

export async function fetchProviderModelEntries(
  ctx: PluginContext,
  baseUrl: string,
  apiKey: string,
): Promise<unknown[]> {
  const trimmedUrl = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmedUrl) {
    throw new Error("请先填写供应商的基础 API 地址 (Base URL)");
  }
  // 安全验证：仅允许 HTTP/HTTPS 协议（3a40c5985 合并时误删，此处恢复）
  if (!trimmedUrl.match(/^https?:\/\//i)) {
    throw new Error("Base URL 必须以 http:// 或 https:// 开头");
  }

  // 1. 优先使用 CC GUI 宿主原生提供的 fetch_provider_models 命令（支持任意第三方代理域名，无 network 权限限制，且自动探测 /v1/models、兼容 OpenAI 与 Anthropic 格式）
  try {
    const res = await invokeHost<ProviderModelList>("fetch_provider_models", {
      baseUrl: trimmedUrl,
      apiKey: apiKey.trim(),
    });
    const hostEntries = (Array.isArray(res?.models) ? res.models : []).concat(Array.isArray(res?.data) ? res.data : []);
    if (hostEntries.length > 0) {
      return hostEntries;
    }
  } catch (tauriErr) {
    // Remote keys/endpoints belong to the host, including its localhost URLs.
    if (isRemoteHost()) throw tauriErr;
    console.warn("[model-switcher] 原生 fetch_provider_models 失败，降级尝试插件桥接:", tauriErr);
  }
  if (isRemoteHost()) return [];

  // 2. 降级方案：依次尝试常见的 OpenAI 兼容模型端点。
  const targetUrls = trimmedUrl.endsWith("/models") || trimmedUrl.endsWith("/v1/models")
    ? [trimmedUrl]
    : [`${trimmedUrl}/v1/models`, `${trimmedUrl}/models`];

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  let rawBody = "";
  let lastError: unknown;

  for (const targetUrl of targetUrls) {
    try {
      const res = await ctx.bridge.invoke<{ status: number; body: string }>("plugin_http_request", {
        method: "GET", url: targetUrl, headers,
      });
      if (res.status >= 200 && res.status < 300) {
        rawBody = res.body;
        break;
      }
      lastError = new Error(`HTTP 状态码错误: ${res.status}`);
    } catch (bridgeErr) {
      try {
        const resp = await fetch(targetUrl, { method: "GET", headers });
        if (resp.ok) {
          rawBody = await resp.text();
          break;
        }
        lastError = new Error(`HTTP 请求失败: ${resp.status} ${resp.statusText}`);
      } catch (fetchErr) {
        lastError = fetchErr;
      }
    }
  }
  if (!rawBody) {
    throw new Error(`拉取模型列表失败: 请检查 Base URL 与 API Key 是否有效。${lastError instanceof Error ? `（${lastError.message}）` : ""}`);
  }

  try {
    const json = JSON.parse(rawBody);
    // 保留原始条目，供模型元数据（context_window/max_tokens 等）提取使用
    if (Array.isArray(json.data)) return json.data;
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.models)) return json.models;
    throw new Error("返回的数据结构中未包含识别出的模型列表数据 (data/models)");
  } catch (err) {
    if (err instanceof Error && err.message.includes("返回的数据结构")) {
      throw err;
    }
    throw new Error(`模型响应数据解析 JSON 失败: ${rawBody.slice(0, 100)}`);
  }
}

export async function fetchModelsFromProvider(
  ctx: PluginContext,
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  const entries = await fetchProviderModelEntries(ctx, baseUrl, apiKey);
  const byId = normalizeModelIds(entries);
  if (byId.length > 0) return Array.from(new Set(byId));
  // Ollama /api/tags 等只返回 name 的列表：id 全空时回退到 name
  const byName = entries.map(item =>
    item && typeof item === "object" && "name" in item && typeof item.name === "string" ? item.name : "",
  ).filter(Boolean);
  return Array.from(new Set(byName));
}

/**
 * CLI 原生配置渠道的模型列表：
 * Claude/Codex 配置了 Base URL 时可读取远端模型；Kimi/Grok 必须使用 CLI 注册的别名，
 * OMP/PI 使用 CLI 的供应商限定目录，均不能由远端裸 ID 替代。
 */
export async function loadNativeChannelModels(
  ctx: PluginContext,
  engine: CliEngineId,
  channel: { baseUrl?: string; apiKey?: string } | null | undefined,
  force = false,
): Promise<NativeCatalog> {
  if (engine === "omp" || engine === "pi" || engine === "kimi" || engine === "grok") {
    return getNativeCatalog(engine, force);
  }
  const baseUrl = channel?.baseUrl?.trim() ?? "";
  if (baseUrl) {
    try {
      const ids = await fetchModelsFromProvider(ctx, baseUrl, channel?.apiKey ?? "");
      return { models: ids.map((id) => ({ id })), authoritative: false };
    } catch {
      return getNativeCatalog(engine, force);
    }
  }
  return getNativeCatalog(engine, force);
}
