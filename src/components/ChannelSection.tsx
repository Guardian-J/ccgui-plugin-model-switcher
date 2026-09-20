import { React, useState } from "../react-context";
import type { SystemProviderChannel, CustomPluginChannel, ChannelFormState } from "../types";
import {
  ProjectEngineIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  EyeIcon,
  EyeOffIcon,
} from "../icons";
import { ChannelForm } from "./ChannelForm";
import { ChannelList } from "./ChannelList";

const ROW = "ms-row";
const ROW_ON = "is-selected";
const ROW_OFF = "";
const ICON_BTN = "ms-icon-button";
const FIELD = "ms-field";

function CloseIcon({ size = 16 }: { size?: number }) {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function SecretInput({
  value,
  onChange,
  placeholder,
  readOnly,
}: {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="ms-secret-field">
      <input
        type={visible ? "text" : "password"}
        value={value}
        readOnly={readOnly}
        onChange={
          readOnly || !onChange
            ? undefined
            : (e) => onChange(e.target.value)
        }
        placeholder={placeholder}
        autoComplete="off"
        className={FIELD}
      />
      <button
        type="button"
        className={`${ICON_BTN} ms-secret-toggle`}
        aria-label={visible ? "隐藏 API Key" : "查看 API Key"}
        title={visible ? "隐藏" : "查看"}
        aria-pressed={visible}
        onClick={() => setVisible((prev) => !prev)}
      >
        {visible ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
      </button>
    </span>
  );
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
  sourceLabel,
  channelId,
}: {
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
  sourceLabel?: "插件" | "系统";
  /** YAML / 宿主供应商 id，同名渠道靠它区分 */
  channelId?: string;
}) {
  const hostLine = url ? url.replace(/^https?:\/\//, "") : detail;
  const subtitle = hostLine || channelId;
  const tooltip = [name, channelId, url, detail].filter(Boolean).join("\n");
  return (
    <div className={`ms-channel-row ${selected ? ROW_ON : ROW_OFF}`}>
      <button
        type="button"
        className={ROW}
        onClick={onSelect}
        disabled={disabled || selectDisabled}
        aria-pressed={selected}
        title={tooltip}
      >
        <ProjectEngineIcon engine={brand} size={18} />
        <span className="ms-row-copy">
          <span className="ms-row-title">
            <span className="ms-row-name">{name}</span>
            {sourceLabel ? (
              <span className={`ms-source-label ms-source-${sourceLabel === "插件" ? "plugin" : "system"}`}>
                {sourceLabel}
              </span>
            ) : null}
          </span>
          {subtitle ? <span className="ms-row-detail">{subtitle}</span> : null}
        </span>
        {selected ? <CheckIcon size={16} className="ms-check" /> : null}
      </button>
      {onView ? (
        <button
          type="button"
          aria-label="查看渠道"
          title="查看系统渠道"
          onClick={onView}
          disabled={disabled}
          className={`${ICON_BTN} ms-view-channel`}
        >
          <EyeIcon size={13} />
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          aria-label="删除渠道"
          title="删除该插件独立渠道"
          onClick={onDelete}
          disabled={disabled}
          className={`${ICON_BTN} ms-delete`}
        >
          <TrashIcon size={13} />
        </button>
      ) : null}
      {onEdit ? (
        <button
          type="button"
          aria-label="编辑渠道"
          title="编辑渠道"
          onClick={onEdit}
          disabled={disabled}
          className={`${ICON_BTN} ms-edit-channel`}
        >
          ✎
        </button>
      ) : null}
    </div>
  );
}

interface ChannelSectionProps {
  channelSupportError?: string | null;
  channelTab: "system" | "plugin";
  onTabChange: (tab: "system" | "plugin") => void;
  systemChannels: SystemProviderChannel[];
  pluginCustomChannels: CustomPluginChannel[];
  loadingChannels: boolean;
  fetchingModels: boolean;
  selectedChannelId: string | null;
  isPluginActive: boolean;
  showAddChannel: boolean;
  showProtocol: boolean;
  onToggleAddChannel: () => void;
  onCloseForm: () => void;
  channelForm: ChannelFormState;
  onFormChange: (form: ChannelFormState) => void;
  editingChannelId: string | null;
  viewingChannelId: string | null;
  onSaveChannel: () => void;
  onSelectSystemProvider: (ch: SystemProviderChannel) => void;
  onSelectPluginChannel: (ch: CustomPluginChannel) => void;
  onViewSystemChannel: (ch: SystemProviderChannel, e: React.MouseEvent) => void;
  onEditPluginChannel: (ch: CustomPluginChannel, e: React.MouseEvent) => void;
  onDeletePluginChannel: (id: string, e: React.MouseEvent) => void;
  onEditHostChannel: (ch: SystemProviderChannel, e: React.MouseEvent) => void;
  onDeleteHostChannel: (id: string, e: React.MouseEvent) => void;
  channelBrand: (name: string, model?: string, url?: string, isNative?: boolean) => string;
  /** 是否显示 CLAUDE_CODE_EFFORT_LEVEL 开关（仅 claude-cli 渠道显示） */
  showEffortLevelToggle?: boolean;
  children?: React.ReactNode;
}

export function ChannelSection({
  channelSupportError,
  channelTab,
  onTabChange,
  systemChannels,
  pluginCustomChannels,
  loadingChannels,
  fetchingModels,
  selectedChannelId,
  isPluginActive,
  showAddChannel,
  showProtocol,
  onToggleAddChannel,
  onCloseForm,
  channelForm,
  onFormChange,
  editingChannelId,
  viewingChannelId,
  onSaveChannel,
  onSelectSystemProvider,
  onSelectPluginChannel,
  onViewSystemChannel,
  onEditPluginChannel,
  onDeletePluginChannel,
  onEditHostChannel,
  onDeleteHostChannel,
  channelBrand,
  showEffortLevelToggle,
  children,
}: ChannelSectionProps) {
  const shouldShowForm = showAddChannel && (!channelSupportError || viewingChannelId);
  const channelCount = channelTab === "system"
    ? systemChannels.length
    : pluginCustomChannels.length;

  return (
    <div className="ms-channels">
      <div className="ms-section-heading">
        <h3>供应商渠道</h3>
        <span className="ms-count">{channelCount}</span>
      </div>

      <div className="ms-channel-toolbar">
        <div className="ms-segments" role="group" aria-label="渠道来源">
          <button
            type="button"
            onClick={() => onTabChange("system")}
            aria-pressed={channelTab === "system"}
            className={`${ROW} ${channelTab === "system" ? ROW_ON : ROW_OFF}`}
          >
            系统渠道
          </button>
          <button
            type="button"
            onClick={() => onTabChange("plugin")}
            aria-pressed={channelTab === "plugin"}
            className={`${ROW} ${channelTab === "plugin" ? ROW_ON : ROW_OFF}`}
          >
            独立渠道
          </button>
        </div>
        <span className="ms-actions">
          {channelTab === "plugin" && (
            <button
              type="button"
              aria-label={showAddChannel ? "收起" : "新增渠道"}
              title={channelSupportError || (showAddChannel ? "收起" : "新增独立渠道")}
              disabled={!!channelSupportError}
              onClick={onToggleAddChannel}
              aria-expanded={showAddChannel}
              className={ICON_BTN}
            >
              {showAddChannel ? <CloseIcon size={14} /> : <PlusIcon size={14} />}
            </button>
          )}
        </span>
      </div>

      {channelSupportError && <p className="ms-empty" role="status">{channelSupportError}</p>}

      {shouldShowForm && (
        <ChannelForm
          channelForm={channelForm}
          onFormChange={onFormChange}
          onSaveChannel={onSaveChannel}
          onCloseForm={onCloseForm}
          editingChannelId={editingChannelId}
          viewingChannelId={viewingChannelId}
          showProtocol={showProtocol}
          showEffortLevelToggle={showEffortLevelToggle}
        />
      )}

      <div
        className="ms-channel-list"
        role="group"
        aria-label="供应商渠道"
        aria-busy={loadingChannels}
      >
        <ChannelList
          channelTab={channelTab}
          systemChannels={systemChannels}
          pluginCustomChannels={pluginCustomChannels}
          loadingChannels={loadingChannels}
          fetchingModels={fetchingModels}
          selectedChannelId={selectedChannelId}
          isPluginActive={isPluginActive}
          channelSupportError={channelSupportError}
          onSelectSystemProvider={onSelectSystemProvider}
          onSelectPluginChannel={onSelectPluginChannel}
          onViewSystemChannel={onViewSystemChannel}
          onEditPluginChannel={onEditPluginChannel}
          onDeletePluginChannel={onDeletePluginChannel}
          onEditHostChannel={onEditHostChannel}
          onDeleteHostChannel={onDeleteHostChannel}
          channelBrand={channelBrand}
        />
      </div>
      {children}
    </div>
  );
}
