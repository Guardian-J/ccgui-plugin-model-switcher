import { React } from "../react-context";
import type { CliEngineId } from "../types";
import { ProjectEngineIcon, CheckIcon, TrashIcon, RefreshIcon, inferModelEngine } from "../icons";
import { displayEngineModel } from "../system-bridge";
import type { ModelOptionItem } from "./ModelListSection";

/** 归一化模型 ID 所需的渠道身份：插件渠道要按 plugin_<id> 而非裸 id 去前缀。 */
export type ChannelIdentity = { id: string; isPlugin?: boolean; isNative?: boolean };

interface FavoriteModelsListProps {
  favoriteModelOptions: ModelOptionItem[];
  bareSelectedModel: string;
  activeChannel: ChannelIdentity | null;
  activeEngine: CliEngineId;
  fetchingModels: boolean;
  selectionError: (modelId: string) => string | null;
  onSelectModel: (modelId: string) => void;
  onDeleteCustomModel: (modelId: string, event: React.MouseEvent) => void;
}

export function FavoriteModelsList({
  favoriteModelOptions,
  bareSelectedModel,
  activeChannel,
  activeEngine,
  fetchingModels,
  selectionError,
  onSelectModel,
  onDeleteCustomModel,
}: FavoriteModelsListProps) {
  if (fetchingModels && favoriteModelOptions.length === 0) {
    return (
      <div className="ms-model-loading" role="status">
        <span className="ms-loading-caption">
          <RefreshIcon size={16} className="animate-spin" />
          正在加载模型…
        </span>
        {[0, 1, 2].map((row) => (
          <div key={row} className="ms-skeleton-row" aria-hidden="true">
            <span />
            <div>
              <i />
              <i />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (favoriteModelOptions.length === 0) {
    return <span className="ms-empty">暂无自选模型，请在上方选择模型并加入自选</span>;
  }

  return (
    <>
      {favoriteModelOptions.map((opt) => (
        <ModelRow
          key={opt.id}
          model={opt}
          isSelected={isModelSelected(opt.id, bareSelectedModel, activeChannel, activeEngine)}
          activeEngine={activeEngine}
          selectionError={selectionError}
          onSelectModel={onSelectModel}
          onDeleteCustomModel={onDeleteCustomModel}
        />
      ))}
    </>
  );
}

/**
 * 判断模型行是否为当前选中项。
 * omp/pi 的模型 ID 带供应商前缀，而插件渠道在 CLI 配置里的供应商 id 是 plugin_<渠道 id>，
 * 不是渠道裸 id；统一交给 displayEngineModel 按渠道身份（id + isPlugin/isNative）归一化后再比，
 * 不要手工拼 `渠道 id/模型`，否则同名不同 id 的插件渠道会匹配错。
 */
export function isModelSelected(
  modelId: string,
  bareSelectedModel: string,
  activeChannel: ChannelIdentity | null,
  activeEngine: CliEngineId
): boolean {
  if (!bareSelectedModel) return false;
  const bare = (id: string) => displayEngineModel(activeEngine, activeChannel, id);
  return bare(modelId) === bare(bareSelectedModel);
}

interface ModelRowProps {
  model: ModelOptionItem;
  isSelected: boolean;
  activeEngine: CliEngineId;
  selectionError: (modelId: string) => string | null;
  onSelectModel: (modelId: string) => void;
  onDeleteCustomModel: (modelId: string, event: React.MouseEvent) => void;
}

function ModelRow({
  model,
  isSelected,
  activeEngine,
  selectionError,
  onSelectModel,
  onDeleteCustomModel,
}: ModelRowProps) {
  const error = selectionError(model.id);
  const modelBrand =
    (model.id !== "default"
      ? inferModelEngine(model.label) || inferModelEngine(model.id)
      : null) || activeEngine;

  return (
    <div className={`ms-model-row ${isSelected ? "is-selected" : ""}`}>
      <button
        type="button"
        aria-pressed={isSelected}
        title={error || model.label}
        disabled={!!error}
        onClick={() => onSelectModel(model.id)}
        className="ms-row"
      >
        <ProjectEngineIcon engine={modelBrand} size={18} />
        <span className="ms-row-copy">
          <span className="ms-row-title">
            <span className="ms-row-name">{model.label}</span>
          </span>
          {model.description ? (
            <span className="ms-row-detail">{model.description}</span>
          ) : null}
        </span>
        {isSelected ? <CheckIcon size={16} className="ms-check" /> : null}
      </button>
      {model.custom ? (
        <button
          type="button"
          className="ms-icon-button ms-model-delete"
          aria-label={`移出自选 ${model.id}`}
          title="移出自选"
          onClick={(event) => onDeleteCustomModel(model.id, event)}
        >
          <TrashIcon size={14} />
        </button>
      ) : null}
    </div>
  );
}
