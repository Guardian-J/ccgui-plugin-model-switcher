import { React, useState } from "../react-context";
import type { SystemProviderChannel, CustomPluginChannel, ChannelFormState } from "../types";
import { PI_FAMILY_API_PROTOCOLS } from "../types";
import {
  ProjectEngineIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  EyeIcon,
  EyeOffIcon,
} from "../icons";

const PROTOCOL_LABELS: Record<string, string> = {
  "openai-completions": "OpenAI Completions",
  "openai-responses": "OpenAI Responses",
  "anthropic-messages": "Anthropic Messages",
  "google-generative-ai": "Google Generative AI",
};

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

function SecretInput({
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

function ChannelRow({
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
}) {
  return (
    <div className={`ms-channel-row ${selected ? ROW_ON : ROW_OFF}`}>
      <button
        type="button"
        className={ROW}
        onClick={onSelect}
        disabled={disabled || selectDisabled}
        aria-pressed={selected}
        title={url || detail ? `${name}\n${url || detail}` : name}
      >
        <ProjectEngineIcon engine={brand} size={18} />
        <span className="ms-row-copy">
          <span className="ms-row-title">{name}</span>
          {url || detail ? (
            <span className="ms-row-detail">
              {url ? url.replace(/^https?:\/\//, "") : detail}
            </span>
          ) : null}
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
  channelBrand: (name: string, model?: string, url?: string, isNative?: boolean) => string;
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
  channelBrand,
  children,
}: ChannelSectionProps) {
  return (
    <div className="ms-channels">
      <div className="ms-section-heading">
        <h3>供应商渠道</h3>
        <span className="ms-count">
          {channelTab === "system" ? systemChannels.length : pluginCustomChannels.length}
        </span>
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
          {channelTab === "plugin" ? (
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
          ) : null}
        </span>
      </div>

      {channelSupportError ? <p className="ms-empty" role="status">{channelSupportError}</p> : null}

      {showAddChannel && (!channelSupportError || viewingChannelId) ? (
        <div className="ms-channel-form">
          <label>
            渠道名称
            <input
              value={channelForm.name}
              readOnly={!!viewingChannelId}
              onChange={(e) => onFormChange({ ...channelForm, name: e.target.value })}
              placeholder="渠道名称"
              className={FIELD}
            />
          </label>
          <label>
            Base URL
            <input
              value={channelForm.baseUrl}
              readOnly={!!viewingChannelId}
              onChange={(e) => onFormChange({ ...channelForm, baseUrl: e.target.value })}
              placeholder="Base URL"
              className={FIELD}
            />
          </label>
          <label>
            API Key
            <SecretInput
              key={`${viewingChannelId || editingChannelId || "new"}-key`}
              value={channelForm.apiKey}
              readOnly={!!viewingChannelId}
              onChange={(value) => onFormChange({ ...channelForm, apiKey: value })}
              placeholder="API Key"
            />
          </label>
          {showProtocol ? (
            <label>
              协议类型
              <select
                value={channelForm.api}
                disabled={!!viewingChannelId}
                onChange={(e) => onFormChange({ ...channelForm, api: e.target.value })}
                aria-label="协议类型"
                className={FIELD}
              >
                {PI_FAMILY_API_PROTOCOLS.map((protocol) => (
                  <option key={protocol} value={protocol}>
                    {PROTOCOL_LABELS[protocol] || protocol}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            默认模型
            <input
              value={channelForm.model}
              readOnly={!!viewingChannelId}
              onChange={(e) => onFormChange({ ...channelForm, model: e.target.value })}
              placeholder="默认模型 ID（可选）"
              className={FIELD}
            />
          </label>
          <div className="ms-form-actions">
            <button type="button" onClick={onCloseForm} className="ms-button">
              {viewingChannelId ? "关闭" : "取消"}
            </button>
            {viewingChannelId ? null : (
              <button
                type="button"
                onClick={onSaveChannel}
                className="ms-button ms-primary"
              >
                {editingChannelId ? "保存修改" : "保存"}
              </button>
            )}
          </div>
        </div>
      ) : null}

      <div
        className="ms-channel-list"
        role="group"
        aria-label="供应商渠道"
        aria-busy={loadingChannels}
      >
        {channelTab === "system" ? (
          systemChannels.length === 0 ? (
            <span className="ms-empty">
              {loadingChannels ? "正在加载…" : "尚未配置系统供应商"}
            </span>
          ) : (
            systemChannels.map((ch) => (
              <ChannelRow
                key={ch.id}
                disabled={fetchingModels}
                selectDisabled={!!channelSupportError && !ch.isNative}
                name={ch.name}
                url={ch.baseUrl}
                detail={ch.remark}
                brand={channelBrand(ch.name, ch.model, ch.baseUrl, ch.isNative)}
                selected={!isPluginActive && ch.id === selectedChannelId}
                onSelect={() => onSelectSystemProvider(ch)}
                onView={(e) => onViewSystemChannel(ch, e)}
              />
            ))
          )
        ) : pluginCustomChannels.length === 0 ? (
          <span className="ms-empty">暂无独立渠道</span>
        ) : (
          pluginCustomChannels.map((ch) => (
            <ChannelRow
              key={ch.id}
              disabled={fetchingModels}
              selectDisabled={!!channelSupportError}
              name={ch.name}
              url={ch.baseUrl}
              brand={channelBrand(ch.name, ch.model, ch.baseUrl)}
              selected={isPluginActive && ch.id === selectedChannelId}
              onSelect={() => onSelectPluginChannel(ch)}
              onDelete={(e) => onDeletePluginChannel(ch.id, e)}
              onEdit={channelSupportError ? undefined : (e) => onEditPluginChannel(ch, e)}
            />
          ))
        )}
      </div>
      {children}
    </div>
  );
}
