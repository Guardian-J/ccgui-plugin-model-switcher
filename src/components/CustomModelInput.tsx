import { React } from "../react-context";
import { PlusIcon } from "../icons";
import type { ChannelIdentity } from "./FavoriteModelsList";

interface CustomModelInputProps {
  customInput: string;
  fetchingModels: boolean;
  activeChannel: ChannelIdentity | null;
  onCustomInputChange: (value: string) => void;
  onAddCustomModel: () => void;
}

export function CustomModelInput({
  customInput,
  fetchingModels,
  activeChannel,
  onCustomInputChange,
  onAddCustomModel,
}: CustomModelInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && customInput.trim()) {
      e.preventDefault();
      onAddCustomModel();
    }
  };

  return (
    <div className="ms-custom-model">
      <input
        type="text"
        value={customInput}
        disabled={fetchingModels}
        onChange={(e) => onCustomInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="自定义模型 ID"
        aria-label="自定义模型 ID"
        className="ms-field"
      />
      <button
        type="button"
        disabled={fetchingModels || !customInput.trim() || !activeChannel}
        aria-label="将自定义模型加入自选"
        title="将自定义模型加入自选"
        onClick={onAddCustomModel}
        className="ms-icon-button ms-add-model"
      >
        <PlusIcon size={17} />
      </button>
    </div>
  );
}
