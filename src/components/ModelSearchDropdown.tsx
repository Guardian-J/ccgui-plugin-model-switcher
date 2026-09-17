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
  if (!isOpen) return null;

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
        filteredModels.map(model => {
          const isAdded = favoriteModels.some(m => m.id === model.id);
          return (
            <DropdownItem
              key={model.id}
              model={model}
              isAdded={isAdded}
              activeEngine={activeEngine}
              onSelect={onSelectModel}
            />
          );
        })
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
  const [isHovered, setIsHovered] = React.useState(false);

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
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '10px 12px',
        cursor: 'pointer',
        backgroundColor: isHovered ? '#f3f4f6' : '#ffffff',
        borderBottom: '1px solid #e5e7eb',
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
}
