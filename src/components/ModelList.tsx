import { React } from "../react-context";
import type { CliEngineId } from "../types";
import { ProjectEngineIcon, CheckIcon, TrashIcon, inferModelEngine } from "../icons";

const ROW = "ms-row";
const ROW_ON = "is-selected";
const ROW_OFF = "";
const ICON_BTN = "ms-icon-button";

export interface ModelOptionItem {
  id: string;
  label: string;
  description?: string;
  custom?: boolean;
  catalog?: boolean;
}

interface ModelListProps {
  activeEngine: CliEngineId;
  activeChannel: { id: string } | null;
  favoriteModelOptions: ModelOptionItem[];
  bareSelectedModel: string;
  fetchingModels: boolean;
  selectionError: (modelId: string) => string | null;
  onSelectModel: (modelId: string) => void;
  onDeleteCustomModel: (modelId: string, event: React.MouseEvent) => void;
}

export function ModelList({
  activeEngine,
  activeChannel,
  favoriteModelOptions,
  bareSelectedModel,
  fetchingModels,
  selectionError,
  onSelectModel,
  onDeleteCustomModel,
}: ModelListProps) {
  if (fetchingModels && favoriteModelOptions.length === 0) {
    return (
      <div className="ms-model-loading" role="status">
        <span className="ms-loading-caption">正在加载模型…</span>
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
      {favoriteModelOptions.map((opt) => {
        const isSelected = Boolean(
          bareSelectedModel === opt.id ||
            (activeChannel &&
              (bareSelectedModel === `${activeChannel.id}/${opt.id}` ||
                opt.id === `${activeChannel.id}/${bareSelectedModel}`))
        );
        const error = selectionError(opt.id);
        const modelBrand =
          (opt.id !== "default"
            ? inferModelEngine(opt.label) || inferModelEngine(opt.id)
            : null) || activeEngine;
        return (
          <div key={opt.id} className={`ms-model-row ${isSelected ? ROW_ON : ""}`}>
            <button
              type="button"
              aria-pressed={isSelected}
              title={error || opt.label}
              disabled={!!error}
              onClick={() => onSelectModel(opt.id)}
              className={`${ROW} ${ROW_OFF}`}
            >
              <ProjectEngineIcon engine={modelBrand} size={18} />
              <span className="ms-row-copy">
                <span className="ms-row-title">
                  <span className="ms-row-name">{opt.label}</span>
                </span>
                {opt.description ? (
                  <span className="ms-row-detail">{opt.description}</span>
                ) : null}
              </span>
              {isSelected ? <CheckIcon size={16} className="ms-check" /> : null}
            </button>
            {opt.custom ? (
              <button
                type="button"
                className={`${ICON_BTN} ms-model-delete`}
                aria-label={`移出自选 ${opt.id}`}
                title="移出自选"
                onClick={(event) => onDeleteCustomModel(opt.id, event)}
              >
                <TrashIcon size={14} />
              </button>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
