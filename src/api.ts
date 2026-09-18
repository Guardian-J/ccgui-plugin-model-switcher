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

export async function fetchModelsFromProvider(
  ctx: PluginContext,
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  const trimmedUrl = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmedUrl) {
    throw new Error("请先填写供应商的基础 API 地址 (Base URL)");
  }

  // 1. 优先使用 CC GUI 宿主原生提供的 fetch_provider_models 命令（支持任意第三方代理域名，无 network 权限限制，且自动探测 /v1/models、兼容 OpenAI 与 Anthropic 格式）
  try {
    const res = await invokeHost<ProviderModelList>("fetch_provider_models", {
      baseUrl: trimmedUrl,
      apiKey: apiKey.trim(),
    });
    const hostModels = normalizeModelIds(res?.models).concat(normalizeModelIds(res?.data));
    if (hostModels.length > 0) {
      return Array.from(new Set(hostModels));
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
      const { invokeHost } = await import("./host-transport");
      const res = await invokeHost<{ status: number; body: string }>("plugin_http_request", {
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
    // 兼容 OpenAI 格式: { data: [{ id: "xxx" }] }
    if (Array.isArray(json.data)) {
      return json.data
        .map((item: FetchedModelItem) => item.id)
        .filter(Boolean);
    }
    // 兼容数组直接返回: [{ id: "xxx" }] 或 ["model-a", "model-b"]
    if (Array.isArray(json)) {
      return json
        .map((item: unknown) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "id" in item) {
            return (item as { id: string }).id;
          }
          return "";
        })
        .filter(Boolean);
    }
    // 兼容 Ollama /api/tags: { models: [{ name: "xxx" }] }
    if (Array.isArray(json.models)) {
      return json.models
        .map((m: { name?: string; id?: string }) => m.name || m.id || "")
        .filter(Boolean);
    }

    throw new Error("返回的数据结构中未包含识别出的模型列表数据 (data/models)");
  } catch (err) {
    if (err instanceof Error && err.message.includes("返回的数据结构")) {
      throw err;
    }
    throw new Error(`模型响应数据解析 JSON 失败: ${rawBody.slice(0, 100)}`);
  }
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
