import { React } from "../react-context";
import { SearchIcon } from "../icons";
import { isConcreteModel } from "../selection-policy";
import type { ModelOptionItem } from "./ModelListSection";

interface ModelSearchInputProps {
  searchQuery: string;
  fetchingModels: boolean;
  activeChannel: { id: string } | null;
  catalogModelOptions: ModelOptionItem[];
  favoriteModelOptions: ModelOptionItem[];
  containerRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLInputElement>;
  onSearchChange: (query: string) => void;
  onInputFocus: () => void;
  onAddFavorite: (modelId: string) => void;
}

export function ModelSearchInput({
  searchQuery,
  fetchingModels,
  activeChannel,
  catalogModelOptions,
  favoriteModelOptions,
  containerRef,
  inputRef,
  onSearchChange,
  onInputFocus,
  onAddFavorite,
}: ModelSearchInputProps) {
  const typed = searchQuery.trim();
  const catalogCandidate = catalogModelOptions.find(model => model.id === typed);
  // 目录可能因未登录/接口失败为空：手输的具体模型 ID 仍应能加入自选。
  const candidate = catalogCandidate ?? (isConcreteModel(typed) ? { id: typed, label: typed } : undefined);
  const alreadyAdded = candidate && favoriteModelOptions.some(model => model.id === candidate.id);

  return (
    <div className="ms-model-picker">
      <div className="ms-search" ref={containerRef}>
        <SearchIcon size={14} className="ms-search-icon" />
        <input
          ref={inputRef}
          value={searchQuery}
          disabled={fetchingModels || !activeChannel}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={onInputFocus}
          placeholder={fetchingModels ? "正在拉取模型…" : "搜索或选择模型…"}
          aria-label="搜索或选择模型"
          autoComplete="off"
          className="ms-field"
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
  );
}
