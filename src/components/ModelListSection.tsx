import { React } from "../react-context";
import type { CliEngineId, EffortLevel } from "../types";
import { RefreshIcon } from "../icons";
import { EffortSection } from "./EffortSection";
import { ModelSearchInput } from "./ModelSearchInput";
import { ModelSearchDropdown } from "./ModelSearchDropdown";
import { FavoriteModelsList } from "./FavoriteModelsList";
import { CustomModelInput } from "./CustomModelInput";

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

  // 关闭下拉框
  const closeDropdown = React.useCallback(() => {
    setIsDropdownOpen(false);
  }, []);

  // 点击外部关闭下拉框
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedInContainer = containerRef.current?.contains(target);
      const clickedInDropdown = dropdownRef.current?.contains(target);

      if (!clickedInContainer && !clickedInDropdown) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown]);

  // 计算下拉框位置
  const updateDropdownPosition = React.useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  const handleInputFocus = React.useCallback(() => {
    updateDropdownPosition();
    setIsDropdownOpen(true);
    onSearchFocus?.();
  }, [updateDropdownPosition, onSearchFocus]);

  const handleSelectFromDropdown = React.useCallback((modelId: string) => {
    console.log('[ModelListSection] handleSelectFromDropdown called with:', modelId);
    onSearchChange(modelId);
    console.log('[ModelListSection] onSearchChange called');
    closeDropdown();
    // 确保输入框失去焦点，触发后续逻辑
    setTimeout(() => {
      inputRef.current?.blur();
      console.log('[ModelListSection] input blurred');
    }, 0);
  }, [onSearchChange, closeDropdown]);

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
            className="ms-icon-button"
          >
            <RefreshIcon
              size={14}
              className={fetchingModels ? "animate-spin" : ""}
            />
          </button>
        </span>
      </div>

      <ModelSearchInput
        searchQuery={searchQuery}
        fetchingModels={fetchingModels}
        activeChannel={activeChannel}
        catalogModelOptions={catalogModelOptions}
        favoriteModelOptions={favoriteModelOptions}
        containerRef={containerRef}
        inputRef={inputRef}
        onSearchChange={onSearchChange}
        onInputFocus={handleInputFocus}
        onAddFavorite={onAddFavorite}
      />

      <ModelSearchDropdown
        isOpen={isDropdownOpen}
        position={dropdownPosition}
        dropdownRef={dropdownRef}
        fetchingModels={fetchingModels}
        filteredModels={filteredCatalog}
        favoriteModels={favoriteModelOptions}
        searchQuery={searchQuery}
        activeEngine={activeEngine}
        onSelectModel={handleSelectFromDropdown}
      />

      <div
        className="ms-model-list"
        role="group"
        aria-label="自选模型"
        aria-busy={fetchingModels}
      >
        <FavoriteModelsList
          favoriteModelOptions={favoriteModelOptions}
          bareSelectedModel={bareSelectedModel}
          activeChannel={activeChannel}
          activeEngine={activeEngine}
          fetchingModels={fetchingModels}
          selectionError={selectionError}
          onSelectModel={onSelectModel}
          onDeleteCustomModel={onDeleteCustomModel}
        />
      </div>

      <CustomModelInput
        customInput={customInput}
        fetchingModels={fetchingModels}
        activeChannel={activeChannel}
        onCustomInputChange={onCustomInputChange}
        onAddCustomModel={onAddCustomModel}
      />

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
