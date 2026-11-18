import { React } from "../react-context";
import type { CliEngineId } from "../types";
import { ProjectEngineIcon, RefreshIcon, CheckIcon, inferModelEngine } from "../icons";
import type { ModelOptionItem } from "./ModelListSection";

interface ModelSearchDropdownProps {
  isOpen: boolean;
  position: { top: number; left: number; width: number };
  dropdownRef: React.RefObject<HTMLDivElement>;
  fetchingModels: boolean;
  filteredModels: ModelOptionItem[];
  favoriteModels: ModelOptionItem[];
  searchQuery: string;
  activeEngine: CliEngineId;
  onSelectModel: (modelId: string) => void;
}

const MAX_DROPDOWN_ITEMS = 120;

export function ModelSearchDropdown({
  isOpen,
  position,
  dropdownRef,
  fetchingModels,
  filteredModels,
  favoriteModels,
  searchQuery,
  activeEngine,
  onSelectModel,
}: ModelSearchDropdownProps) {
  const [showAll, setShowAll] = React.useState(false);
  const favoriteIds = React.useMemo(
    () => new Set(favoriteModels.map((m) => m.id)),
    [favoriteModels],
  );

  React.useEffect(() => {
    setShowAll(false);
  }, [isOpen, searchQuery]);

  if (!isOpen) return null;

  const visibleModels =
    showAll || filteredModels.length <= MAX_DROPDOWN_ITEMS
      ? filteredModels
      : filteredModels.slice(0, MAX_DROPDOWN_ITEMS);
  const hasMore = !showAll && filteredModels.length > MAX_DROPDOWN_ITEMS;

  return (
    <div
      ref={dropdownRef}
      className="ms-dropdown"
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
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
      ) : filteredModels.length === 0 ? (
        <div style={{ padding: '16px', textAlign: 'center', color: '#6b7280' }}>
          {searchQuery ? '未找到匹配的模型' : '暂无模型'}
        </div>
      ) : (
        <>
          {visibleModels.map(model => (
            <DropdownItem
              key={model.id}
              model={model}
              isAdded={favoriteIds.has(model.id)}
              activeEngine={activeEngine}
              onSelect={onSelectModel}
            />
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowAll(true);
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: 0,
                background: '#f9fafb',
                color: '#4b5563',
                fontSize: '12px',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              仅显示前 {MAX_DROPDOWN_ITEMS} 项（共 {filteredModels.length} 项），点击展开全部
            </button>
          )}
        </>
      )}
    </div>
  );
}

interface DropdownItemProps {
  model: ModelOptionItem;
  isAdded: boolean;
  activeEngine: CliEngineId;
  onSelect: (modelId: string) => void;
}

function DropdownItem({ model, isAdded, activeEngine, onSelect }: DropdownItemProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(model.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(model.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="ms-dropdown-item"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ProjectEngineIcon engine={inferModelEngine(model.id) || activeEngine} size={16} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {model.label}
          </div>
        </div>
        {isAdded && (
          <span style={{ color: '#9ca3af', flexShrink: 0 }}>
            <CheckIcon size={14} />
          </span>
        )}
      </div>
    </div>
  );
}
