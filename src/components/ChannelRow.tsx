import { React } from "../react-context";
import { ProjectEngineIcon, TrashIcon } from "../icons";

const ROW = "ms-row";
const ROW_ON = "is-selected";
const ROW_OFF = "";
const ICON_BTN = "ms-icon-button";

interface ChannelRowProps {
  name: string;
  url?: string;
  detail?: string;
  brand: string;
  selected: boolean;
  onSelect: () => void;
  onDelete?: (e: React.MouseEvent) => void;
  onEdit?: (e: React.MouseEvent) => void;
  onView?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  selectDisabled?: boolean;
}

export function ChannelRow({
  name,
  url,
  detail,
  brand,
  selected,
  onSelect,
  onDelete,
  onEdit,
  onView,
  disabled,
  selectDisabled,
}: ChannelRowProps) {
  return (
    <div className={`${ROW} ${selected ? ROW_ON : ROW_OFF} ms-channel-row`}>
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled || selectDisabled}
        className="ms-channel-main"
        aria-label={`选择 ${name}`}
      >
        <span className="ms-channel-icon" aria-hidden>
          <ProjectEngineIcon engine={brand} />
        </span>
        <div className="ms-channel-content">
          <span className="ms-channel-name">{name}</span>
          {url ? <span className="ms-channel-url">{url}</span> : null}
          {detail ? <span className="ms-channel-detail">{detail}</span> : null}
        </div>
      </button>
      <span className="ms-channel-actions">
        {onView ? (
          <button
            type="button"
            aria-label="查看渠道"
            title="查看"
            onClick={onView}
            disabled={disabled}
            className={ICON_BTN}
          >
            <EyeIcon size={14} />
          </button>
        ) : null}
        {onEdit ? (
          <button
            type="button"
            aria-label="编辑渠道"
            title="编辑"
            onClick={onEdit}
            disabled={disabled}
            className={ICON_BTN}
          >
            <EditIcon size={14} />
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            aria-label="删除渠道"
            title="删除"
            onClick={onDelete}
            disabled={disabled}
            className={ICON_BTN}
          >
            <TrashIcon size={14} />
          </button>
        ) : null}
      </span>
    </div>
  );
}

function EyeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EditIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
