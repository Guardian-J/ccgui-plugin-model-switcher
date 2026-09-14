import { React } from "../react-context";
import type { CliEngineId, EffortLevel } from "../types";
import {
  ProjectEngineIcon,
  SearchIcon,
  RefreshIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  inferModelEngine,
} from "../icons";
import { EffortSection } from "./EffortSection";

const ROW = "ms-row";
const ROW_ON = "is-selected";
const ROW_OFF = "";
const ICON_BTN = "ms-icon-button";
const FIELD = "ms-field";

export interface ModelOptionItem {
  id: string;
  label: string;
  description?: string;
  custom?: boolean;
}

interface ModelListSectionProps {
  activeEngine: CliEngineId;
  activeChannel: { id: string } | null;
  filteredModelOptions: ModelOptionItem[];
  bareSelectedModel: string;
  fetchingModels: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onFetchModels: () => void;
  selectionError: (modelId: string) => string | null;
  onSelectModel: (modelId: string) => void;
  onDeleteCustomModel: (modelId: string, event: React.MouseEvent) => void;
  customInput: string;
  onCustomInputChange: (val: string) => void;
  onAddCustomModel: () => void;
  effort: EffortLevel;
  onEffortChange: (effort: EffortLevel) => void;
  enable1M: boolean;
  onToggle1M: (enabled: boolean) => void;
}

export function ModelListSection({
  activeEngine,
  activeChannel,
  filteredModelOptions,
  bareSelectedModel,
  fetchingModels,
  searchQuery,
  onSearchChange,
  onFetchModels,
  selectionError,
  onSelectModel,
  onDeleteCustomModel,
  customInput,
  onCustomInputChange,
  onAddCustomModel,
  effort,
  onEffortChange,
  enable1M,
  onToggle1M,
}: ModelListSectionProps) {
  return (
    <div className="ms-models">
      <div className="ms-section-heading">
        <h3>
          可用模型 <span className="ms-count">{filteredModelOptions.length}</span>
        </h3>
        <span className="ms-actions">
          <button
            type="button"
            aria-label="拉取模型"
            title="拉取当前渠道模型"
            disabled={fetchingModels || !activeChannel}
            onClick={onFetchModels}
            className={ICON_BTN}
          >
            <RefreshIcon
              size={14}
              className={fetchingModels ? "animate-spin" : ""}
            />
          </button>
        </span>
      </div>

      <div className="ms-search">
        <SearchIcon size={14} className="ms-search-icon" />
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索模型…"
          aria-label="搜索模型"
          className={FIELD}
        />
      </div>

      <div
        className="ms-model-list"
        role="group"
        aria-label="可用模型"
        aria-busy={fetchingModels}
      >
        {fetchingModels ? (
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
        ) : filteredModelOptions.length === 0 ? (
          <span className="ms-empty">{searchQuery ? "无匹配模型" : "暂无模型"}</span>
        ) : (
          filteredModelOptions.map((opt) => {
            const isSelected = Boolean(
              bareSelectedModel === opt.id ||
                (activeChannel &&
                  (bareSelectedModel === `${activeChannel.id}/${opt.id}` ||
                    opt.id === `${activeChannel.id}/${bareSelectedModel}`)),
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
                    <span className="ms-row-title">{opt.label}</span>
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
                    aria-label={`删除自定义模型 ${opt.id}`}
                    title="删除自定义模型"
                    onClick={(event) => onDeleteCustomModel(opt.id, event)}
                  >
                    <TrashIcon size={14} />
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="ms-custom-model">
        <input
          type="text"
          value={customInput}
          disabled={fetchingModels}
          onChange={(e) => onCustomInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && customInput.trim()) {
              e.preventDefault();
              onAddCustomModel();
            }
          }}
          placeholder="自定义模型 ID"
          aria-label="自定义模型 ID"
          className={FIELD}
        />
        <button
          type="button"
          disabled={fetchingModels || !customInput.trim() || !activeChannel}
          aria-label="添加自定义模型"
          title="添加自定义模型"
          onClick={onAddCustomModel}
          className={`${ICON_BTN} ms-add-model`}
        >
          <PlusIcon size={17} />
        </button>
      </div>

      <EffortSection
        effort={effort}
        onChange={onEffortChange}
        enable1M={enable1M}
        onToggle1M={onToggle1M}
      />
    </div>
  );
}
