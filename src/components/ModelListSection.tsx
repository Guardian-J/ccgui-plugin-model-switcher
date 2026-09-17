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
  catalog?: boolean;
}

interface ModelListSectionProps {
  activeEngine: CliEngineId;
  activeChannel: { id: string } | null;
  favoriteModelOptions: ModelOptionItem[];
  catalogModelOptions: ModelOptionItem[];
  onAddFavorite: (modelId: string) => void;
  bareSelectedModel: string;
  fetchingModels: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onFetchModels: () => void;
  onSearchFocus?: () => void;
  selectionError: (modelId: string) => string | null;
  onSelectModel: (modelId: string) => void;
  onDeleteCustomModel: (modelId: string, event: React.MouseEvent) => void;
  customInput: string;
  onCustomInputChange: (val: string) => void;
  onAddCustomModel: () => void;
  effort: EffortLevel;
  onEffortChange: (effort: EffortLevel) => Promise<boolean>;
  enable1M: boolean;
  onToggle1M: (enabled: boolean) => void;
}

export function ModelListSection({
  activeEngine,
  activeChannel,
  favoriteModelOptions,
  catalogModelOptions,
  onAddFavorite,
  bareSelectedModel,
  fetchingModels,
  searchQuery,
  onSearchChange,
  onFetchModels,
  onSearchFocus,
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
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const [dropdownPosition, setDropdownPosition] = React.useState({ top: 0, left: 0, width: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // 点击外部关闭下拉框
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedInContainer = containerRef.current?.contains(target);
      const clickedInDropdown = dropdownRef.current?.contains(target);

      if (!clickedInContainer && !clickedInDropdown) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 计算下拉框位置
  const updateDropdownPosition = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  };

  const handleInputFocus = () => {
    updateDropdownPosition();
    setIsDropdownOpen(true);
    onSearchFocus?.();
  };

  const handleSelectFromDropdown = (modelId: string) => {
    console.log('[ModelListSection] handleSelectFromDropdown called with:', modelId);
    onSearchChange(modelId);
    console.log('[ModelListSection] onSearchChange called');
    setIsDropdownOpen(false);
    // 确保输入框失去焦点，触发后续逻辑
    setTimeout(() => {
      inputRef.current?.blur();
      console.log('[ModelListSection] input blurred');
    }, 0);
  };

  const candidate = catalogModelOptions.find(model => model.id === searchQuery.trim());
  const alreadyAdded = candidate && favoriteModelOptions.some(model => model.id === candidate.id);

  // 过滤搜索结果
  const filteredCatalog = React.useMemo(() => {
    if (!searchQuery.trim()) return catalogModelOptions;
    const query = searchQuery.toLowerCase();
    return catalogModelOptions.filter(model =>
      model.id.toLowerCase().includes(query) ||
      model.label.toLowerCase().includes(query)
    );
  }, [searchQuery, catalogModelOptions]);
  return (
    <div className="ms-models">
      <div className="ms-section-heading">
        <h3>
          自选模型 <span className="ms-count">{favoriteModelOptions.length}</span>
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

      <div className="ms-model-picker">
        <div className="ms-search" ref={containerRef}>
          <SearchIcon size={14} className="ms-search-icon" />
          <input
            ref={inputRef}
            value={searchQuery}
            disabled={fetchingModels || !activeChannel}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={handleInputFocus}
            placeholder={fetchingModels ? "正在拉取模型…" : "搜索或选择模型…"}
            aria-label="搜索或选择模型"
            autoComplete="off"
            className={FIELD}
          />
        </div>
        <button
          type="button"
          className="ms-button ms-primary ms-favorite-add"
          disabled={fetchingModels || !activeChannel || !candidate || alreadyAdded}
          onClick={() => candidate && onAddFavorite(candidate.id)}
        >
          {alreadyAdded ? "已加入自选" : "加入自选"}
        </button>
      </div>

      {/* 使用 fixed 定位的下拉菜单，渲染在顶层避免层级问题 */}
      {isDropdownOpen && (
        <div
          ref={dropdownRef}
          className="ms-dropdown"
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            maxHeight: '300px',
            overflowY: 'auto',
            backgroundColor: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 9999,
          }}
        >
          {fetchingModels ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#6b7280' }}>
              <span style={{ display: 'inline-block', marginRight: '8px' }}>
                <RefreshIcon size={16} className="animate-spin" />
              </span>
              正在加载模型...
            </div>
          ) : filteredCatalog.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#6b7280' }}>
              {searchQuery ? '未找到匹配的模型' : '暂无模型'}
            </div>
          ) : (
            filteredCatalog.map(model => {
              const isAdded = favoriteModelOptions.some(m => m.id === model.id);
              return (
                <div
                  key={model.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectFromDropdown(model.id);
                  }}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    backgroundColor: '#ffffff',
                    borderBottom: '1px solid #e5e7eb',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ProjectEngineIcon engine={inferModelEngine(model.id) || activeEngine} size={16} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {model.label}
                      </div>
                      {model.description && (
                        <div style={{ fontSize: '11px', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                          {model.description}
                        </div>
                      )}
                    </div>
                    {isAdded && (
                      <span style={{ color: '#9ca3af', flexShrink: 0 }}>
                        <CheckIcon size={14} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <div
        className="ms-model-list"
        role="group"
        aria-label="自选模型"
        aria-busy={fetchingModels}
      >
        {fetchingModels && favoriteModelOptions.length === 0 ? (
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
        ) : favoriteModelOptions.length === 0 ? (
          <span className="ms-empty">暂无自选模型，请在上方选择模型并加入自选</span>
        ) : (
          favoriteModelOptions.map((opt) => {
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
          aria-label="将自定义模型加入自选"
          title="将自定义模型加入自选"
          onClick={onAddCustomModel}
          className={`${ICON_BTN} ms-add-model`}
        >
          <PlusIcon size={17} />
        </button>
      </div>

      <EffortSection
        key={activeEngine}
        engine={activeEngine}
        effort={effort}
        onChange={onEffortChange}
        disabled={fetchingModels}
        enable1M={enable1M}
        onToggle1M={onToggle1M}
      />
    </div>
  );
}
