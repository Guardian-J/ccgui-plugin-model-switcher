import { beforeEach, describe, expect, it, vi } from "vitest";
import * as realReact from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { initReact } from "../react-context";
import { ModelMetadataEditor } from "./ModelMetadataEditor";
import type { PluginContext } from "../ccgui-plugin";
import type { CliEngineId } from "../types";

const { readPiMetadata, writePiMetadata, clearPiMetadata, queryMetadata, queryProviderMetadata, readOverride, writeOverride, clearOverride } =
  vi.hoisted(() => ({
    readPiMetadata: vi.fn(),
    writePiMetadata: vi.fn(),
    clearPiMetadata: vi.fn(),
    queryMetadata: vi.fn(),
    queryProviderMetadata: vi.fn(),
    readOverride: vi.fn(),
    writeOverride: vi.fn(),
    clearOverride: vi.fn(),
  }));

vi.mock("../system-bridge", () => ({
  readPiFamilyModelMetadata: readPiMetadata,
  updatePiFamilyModelMetadata: writePiMetadata,
  clearPiFamilyModelMetadata: clearPiMetadata,
}));

vi.mock("../model-metadata", () => ({
  modelMetadataCacheKey: (providerId: string, modelId: string) => `${providerId}/${modelId}`,
  normalizeMetadataModelId: (modelId: string) => modelId.toLowerCase(),
  queryModelMetadata: queryMetadata,
  queryProviderModelMetadata: queryProviderMetadata,
}));

vi.mock("../model-context-override", () => ({
  readModelContextOverride: readOverride,
  writeModelContextOverride: writeOverride,
  clearModelContextOverride: clearOverride,
}));

initReact(realReact as unknown as Parameters<typeof initReact>[0]);
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

interface EditorProps {
  ctx: PluginContext;
  engine: CliEngineId;
  channel: { id: string; isPlugin?: boolean; baseUrl?: string } | null;
  providerId: string;
  hostModelId: string;
  modelId: string;
  nativeModels: Parameters<typeof ModelMetadataEditor>[0]["nativeModels"];
  onStatus: (message: string) => void;
  onSaved: (metadata: { contextWindow?: number; maxTokens?: number }) => void;
}

function renderEditor(props: EditorProps) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(realReact.createElement(ModelMetadataEditor, props));
  });
  return { host, root };
}

function getInputs(host: HTMLElement) {
  return Array.from(host.querySelectorAll<HTMLInputElement>('input[type="number"]'));
}

function getButton(host: HTMLElement, label: string) {
  return Array.from(host.querySelectorAll("button")).find((button) => button.textContent === label);
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// 打开「输入查询」并直接用预填的当前模型名触发查询。
async function triggerQuery(host: HTMLElement, name?: string) {
  await act(async () => {
    getButton(host, "输入查询")?.click();
  });
  if (name !== undefined) {
    await act(async () => {
      setInput(host.querySelector<HTMLInputElement>('input[type="text"]')!, name);
    });
  }
  await act(async () => {
    getButton(host, "查询")?.click();
  });
}

describe("ModelMetadataEditor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    readPiMetadata.mockReset();
    writePiMetadata.mockReset();
    clearPiMetadata.mockReset();
    queryMetadata.mockReset();
    queryProviderMetadata.mockReset();
    readOverride.mockReset();
    writeOverride.mockReset();
    clearOverride.mockReset();
    readPiMetadata.mockResolvedValue(null);
    writePiMetadata.mockResolvedValue(null);
    clearPiMetadata.mockResolvedValue(true);
    queryMetadata.mockResolvedValue(null);
    queryProviderMetadata.mockResolvedValue(null);
    readOverride.mockResolvedValue(undefined);
    writeOverride.mockResolvedValue(undefined);
    clearOverride.mockResolvedValue(undefined);
  });

  it("prefers a persisted override over native metadata for every CLI", async () => {
    let host!: HTMLElement;
    await act(async () => {
      host = renderEditor({
        ctx: {} as PluginContext,
        engine: "claude",
        channel: { id: "native" },
        providerId: "anthropic",
        hostModelId: "sonnet[1m]",
        modelId: "sonnet",
        nativeModels: [{ id: "sonnet", contextWindow: 200_000 }],
        onStatus: vi.fn(),
        onSaved: vi.fn(),
      }).host;
    });
    readOverride.mockResolvedValue(1_000_000);

    await triggerQuery(host);

    expect(queryMetadata).not.toHaveBeenCalled();
    expect(host.textContent).toContain("已覆盖");
    expect(host.textContent).toContain("1M");
  });

  it("uses native metadata without querying OpenRouter", async () => {
    let host!: HTMLElement;
    await act(async () => {
      host = renderEditor({
        ctx: {} as PluginContext,
        engine: "codex",
        channel: { id: "openai" },
        providerId: "openai",
        hostModelId: "gpt-5.1",
        modelId: "gpt-5.1",
        nativeModels: [{ id: "gpt-5.1", contextWindow: 400_000 }],
        onStatus: vi.fn(),
        onSaved: vi.fn(),
      }).host;
    });

    expect(writeOverride).not.toHaveBeenCalled();
    expect(queryMetadata).not.toHaveBeenCalled();
    expect(host.textContent).toContain("400k");
    expect(host.querySelectorAll('input[type="number"]')).toHaveLength(0);
  });

  it("查询先问模型接口，再兜底 OpenRouter 并持久化覆盖", async () => {
    queryMetadata.mockResolvedValue({ contextWindow: 256_000, maxTokens: 32_768 });
    let host!: HTMLElement;
    await act(async () => {
      host = renderEditor({
        ctx: {} as PluginContext,
        engine: "dsh",
        channel: { id: "provider", baseUrl: "https://api.dsh.example/v1" },
        providerId: "provider",
        hostModelId: "model",
        modelId: "model",
        nativeModels: [],
        onStatus: vi.fn(),
        onSaved: vi.fn(),
      }).host;
    });

    // 默认只展示本地/native，不发起任何远程查询
    expect(queryProviderMetadata).not.toHaveBeenCalled();
    expect(queryMetadata).not.toHaveBeenCalled();

    await triggerQuery(host);

    expect(queryProviderMetadata).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      baseUrl: "https://api.dsh.example/v1",
      modelId: "model",
    }));
    expect(queryMetadata).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      providerId: "provider",
      modelId: "model",
      force: true,
    }));
    expect(writeOverride).toHaveBeenCalledWith("dsh", "model", 256_000);
    expect(host.textContent).toContain("256k");
  });

  it("模型接口已提供上下文信息时不再查询 OpenRouter", async () => {
    queryProviderMetadata.mockResolvedValue({ contextWindow: 128_000, maxTokens: 8_192 });
    let host!: HTMLElement;
    await act(async () => {
      host = renderEditor({
        ctx: {} as PluginContext,
        engine: "dsh",
        channel: { id: "provider", baseUrl: "https://api.dsh.example/v1" },
        providerId: "provider",
        hostModelId: "model",
        modelId: "model",
        nativeModels: [],
        onStatus: vi.fn(),
        onSaved: vi.fn(),
      }).host;
    });

    await triggerQuery(host);

    expect(queryProviderMetadata).toHaveBeenCalled();
    expect(queryMetadata).not.toHaveBeenCalled();
    expect(writeOverride).toHaveBeenCalledWith("dsh", "model", 128_000);
    expect(host.textContent).toContain("128k");
  });

  it("输入查询用指定模型名查 OpenRouter 并写入窗口参数", async () => {
    queryMetadata.mockResolvedValue({ contextWindow: 512_000, maxTokens: 64_000 });
    let host!: HTMLElement;
    await act(async () => {
      host = renderEditor({
        ctx: {} as PluginContext,
        engine: "dsh",
        channel: { id: "provider", baseUrl: "https://api.dsh.example/v1" },
        providerId: "provider",
        hostModelId: "model",
        modelId: "model",
        nativeModels: [],
        onStatus: vi.fn(),
        onSaved: vi.fn(),
      }).host;
    });

    await triggerQuery(host, "sn-xxxxx");

    expect(queryProviderMetadata).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      modelId: "model",
    }));
    expect(queryMetadata).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      modelId: "sn-xxxxx",
      force: true,
    }));
    expect(writeOverride).toHaveBeenCalledWith("dsh", "model", 512_000);
    expect(host.textContent).toContain("512k");
  });

  it("已有完整本地配置且无渠道模型接口时，主动查询仍走 OpenRouter 刷新", async () => {
    readOverride.mockResolvedValue(undefined);
    readPiMetadata.mockResolvedValue({ contextWindow: 200000, maxTokens: 8192 });
    queryMetadata.mockResolvedValue({ contextWindow: 1048576, maxTokens: 943718 });
    writePiMetadata.mockResolvedValue({ contextWindow: 1048576, maxTokens: 943718 });
    let host!: HTMLElement;
    await act(async () => {
      host = renderEditor({
        ctx: {} as PluginContext,
        engine: "omp",
        channel: { id: "provider-a" },
        providerId: "provider-a",
        hostModelId: "kimi-k3.1-pro",
        modelId: "kimi-k3.1-pro",
        nativeModels: [],
        onStatus: vi.fn(),
        onSaved: vi.fn(),
      }).host;
    });
    await act(async () => {
      getButton(host, "输入查询")?.click();
    });
    await act(async () => {
      const input = host.querySelector<HTMLInputElement>('input[type="text"]');
      if (input) setInput(input, "kimi-k3.1-pro");
    });
    await act(async () => {
      getButton(host, "查询")?.click();
    });
    expect(queryMetadata).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      modelId: "kimi-k3.1-pro",
      force: true,
    }));
    expect(writePiMetadata).toHaveBeenCalledWith(
      "omp",
      { id: "provider-a" },
      "kimi-k3.1-pro",
      { contextWindow: 1048576, maxTokens: 943718 },
      true,
    );
    expect(host.textContent).toContain("1M");
  });

  it("输入查询未命中时提示查询失败", async () => {
    queryMetadata.mockResolvedValue(null);
    const onStatus = vi.fn();
    let host!: HTMLElement;
    await act(async () => {
      host = renderEditor({
        ctx: {} as PluginContext,
        engine: "dsh",
        channel: { id: "provider", baseUrl: "https://api.dsh.example/v1" },
        providerId: "provider",
        hostModelId: "model",
        modelId: "model",
        nativeModels: [],
        onStatus,
        onSaved: vi.fn(),
      }).host;
    });

    await triggerQuery(host, "opus-5-5");

    expect(onStatus).toHaveBeenLastCalledWith("查询失败：未找到「opus-5-5」的窗口参数，可修改模型名后重试");
    expect(writeOverride).not.toHaveBeenCalled();
  });

  it("manual save persists the override and native config only for OMP and PI", async () => {
    let host!: HTMLElement;
    await act(async () => {
      host = renderEditor({
        ctx: {} as PluginContext,
        engine: "codex",
        channel: { id: "openai" },
        providerId: "openai",
        hostModelId: "gpt-5.1",
        modelId: "gpt-5.1",
        nativeModels: [{ id: "gpt-5.1", contextWindow: 400_000 }],
        onStatus: vi.fn(),
        onSaved: vi.fn(),
      }).host;
    });

    await act(async () => {
      getButton(host, "编辑")?.click();
    });
    const [contextInput] = getInputs(host);
    expect(contextInput).toBeDefined();
    await act(async () => {
      setInput(contextInput, "1048576");
    });
    await act(async () => {
      getButton(host, "保存覆盖")?.click();
    });

    expect(writeOverride).toHaveBeenCalledWith("codex", "gpt-5.1", 1_048_576);
    expect(writePiMetadata).not.toHaveBeenCalled();
  });

  it("clears a persisted override and reloads native metadata", async () => {
    readOverride.mockResolvedValue(1_000_000);
    let host!: HTMLElement;
    await act(async () => {
      host = renderEditor({
        ctx: {} as PluginContext,
        engine: "claude",
        channel: { id: "native" },
        providerId: "anthropic",
        hostModelId: "sonnet",
        modelId: "sonnet",
        nativeModels: [{ id: "sonnet", contextWindow: 200_000 }],
        onStatus: vi.fn(),
        onSaved: vi.fn(),
      }).host;
    });

    await act(async () => {
      getButton(host, "编辑")?.click();
    });
    readOverride.mockResolvedValue(undefined);
    await act(async () => {
      getButton(host, "清除覆盖")?.click();
    });

    expect(clearOverride).toHaveBeenCalledWith("claude", "sonnet");
    expect(host.textContent).toContain("200k");
  });

  it("OMP saves native config directly and clears any override", async () => {
    writePiMetadata.mockResolvedValue({ contextWindow: 1_048_576, maxTokens: 65_536 });
    let host!: HTMLElement;
    await act(async () => {
      host = renderEditor({
        ctx: {} as PluginContext,
        engine: "omp",
        channel: { id: "provider-a" },
        providerId: "provider-a",
        hostModelId: "provider-a/model-a",
        modelId: "model-a",
        nativeModels: [{ id: "provider-a/model-a" }],
        onStatus: vi.fn(),
        onSaved: vi.fn(),
      }).host;
    });

    await act(async () => {
      getButton(host, "编辑")?.click();
    });
    const [contextInput, maxInput] = getInputs(host);
    await act(async () => {
      setInput(contextInput, "1048576");
      setInput(maxInput, "65536");
    });
    await act(async () => {
      getButton(host, "保存覆盖")?.click();
    });

    expect(writePiMetadata).toHaveBeenLastCalledWith(
      "omp",
      expect.objectContaining({ id: "provider-a" }),
      "model-a",
      { contextWindow: 1_048_576, maxTokens: 65_536 },
      true,
    );
    expect(clearOverride).toHaveBeenCalledWith("omp", "provider-a/model-a");
    expect(writeOverride).not.toHaveBeenCalled();
  });

  it("OMP clearing window config deletes metadata from models.yml and notifies parent", async () => {
    readPiMetadata.mockResolvedValue({ contextWindow: 1_048_576, maxTokens: 65_536 });
    const onSaved = vi.fn();
    let host!: HTMLElement;
    await act(async () => {
      host = renderEditor({
        ctx: {} as PluginContext,
        engine: "omp",
        channel: { id: "provider-a" },
        providerId: "provider-a",
        hostModelId: "provider-a/model-a",
        modelId: "model-a",
        nativeModels: [{ id: "provider-a/model-a", contextWindow: 1_048_576, maxTokens: 65_536 }],
        onStatus: vi.fn(),
        onSaved,
      }).host;
    });

    await act(async () => {
      getButton(host, "编辑")?.click();
    });
    await act(async () => {
      getButton(host, "清除配置")?.click();
    });

    expect(clearOverride).toHaveBeenCalledWith("omp", "provider-a/model-a");
    expect(clearPiMetadata).toHaveBeenCalledWith(
      "omp",
      expect.objectContaining({ id: "provider-a" }),
      "model-a",
    );
    expect(onSaved).toHaveBeenCalledWith({});
    expect(writePiMetadata).not.toHaveBeenCalled();
    expect(host.textContent).toContain("未设置");
  });
});
