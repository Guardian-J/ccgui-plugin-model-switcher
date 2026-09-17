import { React } from "../react-context";
import type { CliEngineId } from "../types";
import { ProjectEngineIcon, CheckIcon, TrashIcon, RefreshIcon, inferModelEngine } from "../icons";
import type { ModelOptionItem } from "./ModelListSection";

interface FavoriteModelsListProps {
  favoriteModelOptions: ModelOptionItem[];
  bareSelectedModel: string;
  activeChannel: { id: string } | null;
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
          isSelected={isModelSelected(opt.id, bareSelectedModel, activeChannel)}
          activeEngine={activeEngine}
          selectionError={selectionError}
          onSelectModel={onSelectModel}
          onDeleteCustomModel={onDeleteCustomModel}
        />
      ))}
    </>
  );
}

function isModelSelected(
  modelId: string,
  bareSelectedModel: string,
  activeChannel: { id: string } | null
): boolean {
  return Boolean(
    bareSelectedModel === modelId ||
      (activeChannel &&
        (bareSelectedModel === `${activeChannel.id}/${modelId}` ||
          modelId === `${activeChannel.id}/${bareSelectedModel}`))
  );
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
