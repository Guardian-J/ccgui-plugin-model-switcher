import { React, useEffect, useRef, useState } from "../react-context";
import type { PluginContext } from "../ccgui-plugin";
import type { CliEngineId } from "../types";
import {
  normalizeMetadataModelId,
  queryModelMetadata,
  queryProviderModelMetadata,
  type ModelMetadata,
} from "../model-metadata";
import {
  clearModelContextOverride,
  readModelContextOverride,
  writeModelContextOverride,
} from "../model-context-override";
import {
  clearPiFamilyModelMetadata,
  readPiFamilyModelMetadata,
  updatePiFamilyModelMetadata,
  type NativeModel,
} from "../system-bridge";

interface Props {
  ctx: PluginContext;
  engine: CliEngineId;
  channel: { id: string; isPlugin?: boolean; baseUrl?: string; apiKey?: string } | null;
  providerId: string;
  /** Provider-qualified selector as stored by the host for this session. */
  hostModelId: string;
  /** Model selector shown in the current CLI channel context. */
  modelId: string;
  nativeModels: NativeModel[];
  onStatus: (message: string) => void;
  onSaved: (metadata: ModelMetadata) => void;
}

function metadataValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function formatMetadataValue(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

// token 量压缩为十进制简写：1000k→1M、65536→65.5k，保留一位小数并去尾零。
function formatTokenCount(value: number): string {
  const withUnit = (n: number, unit: string) => `${n.toFixed(1).replace(/\.0$/, "")}${unit}`;
  if (value >= 1e9) return withUnit(value / 1e9, "B");
  if (value >= 1e6) return withUnit(value / 1e6, "M");
  if (value >= 1e3) return withUnit(value / 1e3, "k");
  return String(value);
}

function mergeMetadata(...sources: Array<ModelMetadata | null | undefined>): ModelMetadata {
  const result: ModelMetadata = {};
  for (const source of sources) {
    if (!source) continue;
    if (result.contextWindow === undefined) result.contextWindow = source.contextWindow;
    if (result.maxTokens === undefined) result.maxTokens = source.maxTokens;
  }
  return result;
}

function findNativeModel(models: NativeModel[], modelId: string): NativeModel | undefined {
  const selected = normalizeMetadataModelId(modelId);
  return models.find((model) => {
    const normalized = normalizeMetadataModelId(model.id);
    return normalized === selected || normalized.endsWith(`/${selected}`);
  });
}

export function ModelMetadataEditor({
  ctx,
  engine,
  channel,
  providerId,
  hostModelId,
  modelId,
  nativeModels,
  onStatus,
  onSaved,
}: Props) {
  const [metadata, setMetadata] = useState<ModelMetadata>({});
  const [overrideActive, setOverrideActive] = useState(false);
  const [configActive, setConfigActive] = useState(false);
  const [editing, setEditing] = useState(false);
  const [contextInput, setContextInput] = useState("");
  const [maxInput, setMaxInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [queryOpen, setQueryOpen] = useState(false);
  const [queryName, setQueryName] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const request = useRef(0);
  const supportsNativeConfig = engine === "omp" || engine === "pi";

  async function autoFill(force: boolean, customModelName?: string): Promise<void> {
    const requestId = ++request.current;
    setLoading(true);
    let attemptedRemote = false;
    let remoteHit = false;
    try {
      const native = findNativeModel(nativeModels, modelId);
      const effectiveProviderId = native?.provider || providerId;
      const nativeMetadata: ModelMetadata = {
        contextWindow: native?.contextWindow ?? undefined,
        maxTokens: native?.maxTokens ?? undefined,
      };
      const [override, config] = await Promise.all([
        readModelContextOverride(engine, hostModelId),
        supportsNativeConfig ? readPiFamilyModelMetadata(engine, channel, modelId) : Promise.resolve(null),
      ]);
      let next = mergeMetadata(
        override === undefined ? undefined : { contextWindow: override },
        config,
        nativeMetadata,
      );
      setOverrideActive(override !== undefined);
      setConfigActive(Boolean(config && (config.contextWindow !== undefined || config.maxTokens !== undefined)));

      const applyFetched = async (fetched: ModelMetadata): Promise<void> => {
        remoteHit = true;
        if (supportsNativeConfig) {
          await updatePiFamilyModelMetadata(engine, channel, modelId, fetched, true);
          const refreshed = await readPiFamilyModelMetadata(engine, channel, modelId);
          setConfigActive(Boolean(refreshed && (refreshed.contextWindow !== undefined || refreshed.maxTokens !== undefined)));
          next = mergeMetadata(fetched, refreshed, nativeMetadata);
        } else {
          next = mergeMetadata(fetched, next);
        }
        // 宿主仪表分母实时读记忆档（优先于不刷新的 models.yml catalog），
        // 故 omp/pi 也写记忆档，使覆盖在上报窗口的引擎回写前立即生效。
        if (next.contextWindow !== undefined) {
          await writeModelContextOverride(engine, hostModelId, next.contextWindow);
          setOverrideActive(true);
        }
      };

      // 主动「输入查询」（force=true）总是执行远程查询，不受本地已有值或覆盖限制：
      // 先问渠道模型接口（按当前 modelId），再兜底 OpenRouter（用指定模型名，未指定则用当前 modelId）。
      if (force) {
        attemptedRemote = true;
        if (channel?.baseUrl) {
          const viaApi = await queryProviderModelMetadata(ctx, {
            baseUrl: channel.baseUrl,
            apiKey: channel.apiKey,
            modelId,
          });
          if (viaApi) await applyFetched(viaApi);
        }
        // 渠道模型接口未命中时，总是再问 OpenRouter，不受本地已有值限制。
        if (!remoteHit) {
          const fetched = await queryModelMetadata(ctx, {
            providerId: effectiveProviderId,
            modelId: (customModelName ?? modelId).trim(),
            baseUrl: channel?.baseUrl,
            knownContextWindow: next.contextWindow ?? nativeMetadata.contextWindow,
            force: true,
          });
          if (fetched) await applyFetched(fetched);
        }
      }

      if (request.current !== requestId) return;
      setMetadata(next);
      setContextInput(formatMetadataValue(next.contextWindow));
      setMaxInput(formatMetadataValue(next.maxTokens));
      if (attemptedRemote) {
        const queriedName = (customModelName ?? modelId).trim();
        if (remoteHit) {
          const partial = !next.contextWindow || (supportsNativeConfig && !next.maxTokens);
          const text = partial
            ? `查询成功：已按「${queriedName}」部分更新（仍缺字段，可手动补填）`
            : `查询成功：已按「${queriedName}」更新窗口参数`;
          setResult({ ok: true, text });
          onSaved(next);
          onStatus(text);
        } else {
          const text = `查询失败：未找到「${queriedName}」的窗口参数，可修改模型名后重试`;
          setResult({ ok: false, text });
          onStatus(text);
        }
      } else {
        setResult(null);
        if (!next.contextWindow || (supportsNativeConfig && !next.maxTokens)) {
          onStatus("缺少上下文窗口，可编辑后手动覆盖");
        }
      }
    } catch (error) {
      if (request.current !== requestId) return;
      const text = error instanceof Error ? error.message : "模型元数据查询失败";
      setResult({ ok: false, text });
      onStatus(text);
    } finally {
      if (request.current === requestId) setLoading(false);
    }
  }

  useEffect(() => {
    void autoFill(false);
    return () => { request.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, providerId, channel?.id, channel?.baseUrl, hostModelId, modelId, nativeModels]);

  const save = async () => {
    const contextWindow = metadataValue(contextInput);
    const maxTokens = metadataValue(maxInput);
    if (contextWindow === undefined || (supportsNativeConfig && maxTokens === undefined)) {
      onStatus(supportsNativeConfig ? "contextWindow 和 maxTokens 必须填写正整数" : "contextWindow 必须填写正整数");
      return;
    }
    setSaving(true);
    try {
      let saved: ModelMetadata = { contextWindow, maxTokens };
      if (supportsNativeConfig) {
        saved = await updatePiFamilyModelMetadata(
          engine,
          channel,
          modelId,
          { contextWindow, maxTokens },
          true,
        ) ?? saved;
        setConfigActive(true);
      } else {
        // 非 native CLI 没有 models.yml，只更新展示用覆盖。
        saved = { contextWindow };
      }
      // 覆盖值写记忆档：宿主仪表分母实时读它、优先级高于不刷新的 models.yml catalog，
      // 这样 omp/pi 手动设置的窗口不必等宿主重探目录即可生效。
      await writeModelContextOverride(engine, hostModelId, contextWindow);
      setOverrideActive(true);
      setMetadata(saved);
      setContextInput(formatMetadataValue(saved.contextWindow));
      setMaxInput(formatMetadataValue(saved.maxTokens));
      setEditing(false);
      setResult(null);
      onSaved(saved);
      onStatus(supportsNativeConfig ? "已保存到渠道配置" : "已保存覆盖");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "保存模型元数据失败");
    } finally {
      setSaving(false);
    }
  };

  const clearOverride = async () => {
    setSaving(true);
    try {
      await clearModelContextOverride(engine, hostModelId);
      if (request.current === 0) request.current = 1;
      request.current += 1;
      if (supportsNativeConfig) {
        await clearPiFamilyModelMetadata(engine, channel, modelId);
        setOverrideActive(false);
        setConfigActive(false);
        setMetadata({});
        setContextInput("");
        setMaxInput("");
        setEditing(false);
        setResult(null);
        onSaved({});
        onStatus("已清除模型窗口配置");
      } else {
        setOverrideActive(false);
        setEditing(false);
        onSaved({});
        await autoFill(false);
        onStatus("已清除手动窗口覆盖");
      }
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "清除模型窗口覆盖失败");
    } finally {
      setSaving(false);
    }
  };

  const returnToSummary = () => {
    setContextInput(formatMetadataValue(metadata.contextWindow));
    setMaxInput(formatMetadataValue(metadata.maxTokens));
    setEditing(false);
  };
  const runManualQuery = async () => {
    const name = queryName.trim();
    if (!name) return;
    await autoFill(true, name);
  };
  const dirty =
    contextInput !== formatMetadataValue(metadata.contextWindow) ||
    (supportsNativeConfig && maxInput !== formatMetadataValue(metadata.maxTokens));

  return (
    <section className="ms-metadata" aria-label="模型窗口参数">
      {editing ? (
        <>
          <div className="ms-section-heading">
            <h3>模型窗口参数</h3>
            <button
              type="button"
              className="ms-button ms-quiet"
              disabled={loading || saving}
              onClick={() => {
                setEditing(false);
                setQueryName(modelId);
                setQueryOpen(true);
              }}
            >
              输入查询
            </button>
          </div>
          <div className="ms-metadata-grid">
            <label>
              contextWindow
              <input
                className="ms-field"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={contextInput}
                disabled={loading || saving}
                onChange={(event) => setContextInput(event.target.value)}
              />
            </label>
            {supportsNativeConfig ? (
              <label>
                maxTokens
                <input
                  className="ms-field"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={maxInput}
                  disabled={loading || saving}
                  onChange={(event) => setMaxInput(event.target.value)}
                />
              </label>
            ) : null}
          </div>
          <div className="ms-form-actions">
            <button type="button" className="ms-button" disabled={saving} onClick={returnToSummary}>
              取消
            </button>
            {overrideActive || (supportsNativeConfig && configActive) ? (
              <button type="button" className="ms-button" disabled={saving} onClick={() => void clearOverride()}>
                {overrideActive ? "清除覆盖" : "清除配置"}
              </button>
            ) : null}
            <button
              type="button"
              className="ms-button ms-primary"
              disabled={loading || saving || !dirty}
              onClick={() => void save()}
            >
              {saving ? "保存中…" : "保存覆盖"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="ms-metadata-bar">
            <span className="ms-metadata-chip">
              <em>上下文窗口</em>
              <strong title={metadata.contextWindow === undefined ? "" : metadata.contextWindow.toLocaleString("en-US")}>{metadata.contextWindow === undefined ? "未设置" : formatTokenCount(metadata.contextWindow)}</strong>
            </span>
            {supportsNativeConfig ? (
              <span className="ms-metadata-chip">
                <em>最大输出</em>
                <strong title={metadata.maxTokens === undefined ? "" : metadata.maxTokens.toLocaleString("en-US")}>{metadata.maxTokens === undefined ? "未设置" : formatTokenCount(metadata.maxTokens)}</strong>
              </span>
            ) : null}
            {overrideActive ? (
              <span className="ms-metadata-badge">已覆盖</span>
            ) : null}
            <div className="ms-metadata-tools">
              <button
                type="button"
                className="ms-button ms-quiet"
                disabled={loading || saving}
                onClick={() => {
                  setQueryName(modelId);
                  setQueryOpen((open) => !open);
                }}
              >
                输入查询
              </button>
              <button
                type="button"
                className="ms-button ms-quiet"
                disabled={loading || saving}
                onClick={() => {
                  setContextInput(formatMetadataValue(metadata.contextWindow));
                  setMaxInput(formatMetadataValue(metadata.maxTokens));
                  setEditing(true);
                }}
              >
                编辑
              </button>
            </div>
          </div>
          {queryOpen ? (
            <div className="ms-metadata-query">
              <input
                className="ms-field"
                type="text"
                placeholder="输入模型名查询，如 sn-xxxxx、opus-5-5"
                value={queryName}
                disabled={loading || saving}
                autoFocus
                onChange={(event) => setQueryName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void runManualQuery();
                }}
              />
              <button
                type="button"
                className="ms-button ms-primary"
                disabled={loading || saving || queryName.trim() === ""}
                onClick={() => void runManualQuery()}
              >
                {loading ? "查询中…" : "查询"}
              </button>
              <button
                type="button"
                className="ms-button"
                disabled={loading || saving}
                onClick={() => {
                  setQueryOpen(false);
                  setQueryName("");
                }}
              >
                收起
              </button>
            </div>
          ) : null}
        </>
      )}
      {result ? (
        <div className={`ms-metadata-result ${result.ok ? "is-ok" : "is-fail"}`} role="status">
          {result.text}
        </div>
      ) : null}
    </section>
  );
}
