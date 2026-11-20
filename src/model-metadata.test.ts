import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  lookupOpenRouterMetadata,
  modelMetadataCacheKey,
  queryModelMetadata,
  queryProviderModelMetadata,
} from "./model-metadata";
import type { PluginContext } from "./ccgui-plugin";

const { fetchEntries } = vi.hoisted(() => ({ fetchEntries: vi.fn() }));
vi.mock("./api", () => ({ fetchProviderModelEntries: fetchEntries }));

const catalog = [
  {
    id: "openai/shared-model",
    context_length: 200_000,
    top_provider: { max_completion_tokens: 8_192 },
  },
  {
    id: "relay-provider/shared-model",
    context_length: 1_000_000,
    top_provider: { max_completion_tokens: 32_768 },
  },
];

interface TestContext {
  bridge: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
  storage: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
}

function createContext(): PluginContext & TestContext {
  const values = new Map<string, unknown>();
  return {
    bridge: {
      invoke: vi.fn(async () => ({ status: 200, body: JSON.stringify({ data: catalog }) })),
    },
    storage: {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
    },
  } as unknown as PluginContext & TestContext;
}

describe("model-metadata", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses provider and model id as the result cache key", () => {
    expect(modelMetadataCacheKey("provider-a", "Model/Name")).toBe(
      "model-metadata:provider-a:model/name",
    );
    expect(modelMetadataCacheKey("provider-b", "Model/Name")).not.toBe(
      modelMetadataCacheKey("provider-a", "Model/name"),
    );
  });

  it("prefers the exact vendor when the same model id exists under multiple vendors", () => {
    expect(lookupOpenRouterMetadata(catalog, {
      providerId: "relay-provider",
      modelId: "shared-model",
    })).toEqual({ contextWindow: 1_000_000, maxTokens: 32_768 });
  });

  it("uses a known context window to disambiguate colliding vendor models", () => {
    expect(lookupOpenRouterMetadata(catalog, {
      providerId: "plugin_model-switcher_custom_1",
      modelId: "shared-model",
      knownContextWindow: 200_000,
    })).toEqual({ contextWindow: 200_000, maxTokens: 8_192 });
  });

  it("strips gateway routing prefixes when matching model ids", () => {
    const entries = [
      { id: "moonshotai/kimi-k3.1-pro", context_length: 1_048_576, top_provider: { max_completion_tokens: 943_718 } },
    ];
    expect(lookupOpenRouterMetadata(entries, {
      providerId: "cdn-sta1n",
      modelId: "[Cloud]Kimi-K3.1-Pro",
    })).toEqual({ contextWindow: 1_048_576, maxTokens: 943_718 });
  });

  it("does not guess when colliding models provide different windows", () => {
    expect(lookupOpenRouterMetadata(catalog, {
      providerId: "plugin_model-switcher_custom_1",
      modelId: "shared-model",
    })).toBeNull();
  });

  it("caches metadata per provider and model without fetching a second time", async () => {
    const ctx = createContext();

    await expect(queryModelMetadata(ctx, {
      providerId: "plugin_model-switcher_custom_1",
      modelId: "shared-model",
      baseUrl: "https://api.openai.com/v1",
    })).resolves.toEqual({ contextWindow: 200_000, maxTokens: 8_192 });
    await expect(queryModelMetadata(ctx, {
      providerId: "plugin_model-switcher_custom_2",
      modelId: "shared-model",
      baseUrl: "https://api.openai.com/v1",
    })).resolves.toEqual({ contextWindow: 200_000, maxTokens: 8_192 });

    expect(ctx.storage.set).toHaveBeenCalledWith(
      "model-metadata:plugin_model-switcher_custom_1:shared-model",
      expect.objectContaining({ contextWindow: 200_000, maxTokens: 8_192, source: "openrouter" }),
    );
    expect(ctx.storage.set).toHaveBeenCalledWith(
      "model-metadata:plugin_model-switcher_custom_2:shared-model",
      expect.objectContaining({ contextWindow: 200_000, maxTokens: 8_192 }),
    );
    expect(ctx.bridge.invoke).toHaveBeenCalledTimes(1);
  });
});

describe("queryProviderModelMetadata", () => {
  beforeEach(() => {
    fetchEntries.mockReset();
  });

  it("reads context/output limits from the provider model entry", async () => {
    fetchEntries.mockResolvedValue([
      { id: "other-model", context_window: 64_000 },
      { id: "provider-a/model-a", context_window: 128_000, max_tokens: 8_192 },
    ]);

    await expect(queryProviderModelMetadata({} as PluginContext, {
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      modelId: "model-a",
    })).resolves.toEqual({ contextWindow: 128_000, maxTokens: 8_192 });
    expect(fetchEntries).toHaveBeenCalledWith(expect.anything(), "https://api.example.com/v1", "sk-test");
  });

  it("supports nested limit objects and returns null when nothing matches", async () => {
    fetchEntries.mockResolvedValueOnce([
      { id: "model-a", limit: { context: 200_000, output: 16_384 } },
    ]);
    await expect(queryProviderModelMetadata({} as PluginContext, {
      baseUrl: "https://api.example.com/v1",
      modelId: "model-a",
    })).resolves.toEqual({ contextWindow: 200_000, maxTokens: 16_384 });

    fetchEntries.mockResolvedValueOnce([{ id: "model-a" }, { id: "model-b", context_window: 64_000 }]);
    await expect(queryProviderModelMetadata({} as PluginContext, {
      baseUrl: "https://api.example.com/v1",
      modelId: "model-a",
    })).resolves.toBeNull();
  });

  it("returns null without a baseUrl or when the request fails", async () => {
    await expect(queryProviderModelMetadata({} as PluginContext, { modelId: "model-a" })).resolves.toBeNull();
    expect(fetchEntries).not.toHaveBeenCalled();

    fetchEntries.mockRejectedValue(new Error("network down"));
    await expect(queryProviderModelMetadata({} as PluginContext, {
      baseUrl: "https://api.example.com/v1",
      modelId: "model-a",
    })).resolves.toBeNull();
  });
});
