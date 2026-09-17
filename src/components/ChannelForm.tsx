import { React } from "../react-context";
import type { ChannelFormState } from "../types";
import { PI_FAMILY_API_PROTOCOLS } from "../types";
import { SecretInput } from "./ChannelSection";

const PROTOCOL_LABELS: Record<string, string> = {
  "openai-completions": "OpenAI Completions",
  "openai-responses": "OpenAI Responses",
  "anthropic-messages": "Anthropic Messages",
  "google-generative-ai": "Google Generative AI",
};

interface ChannelFormProps {
  channelForm: ChannelFormState;
  onFormChange: (form: ChannelFormState) => void;
  onSaveChannel: () => void;
  onCloseForm: () => void;
  editingChannelId: string | null;
  viewingChannelId: string | null;
  showProtocol: boolean;
}

export function ChannelForm({
  channelForm,
  onFormChange,
  onSaveChannel,
  onCloseForm,
  editingChannelId,
  viewingChannelId,
  showProtocol,
}: ChannelFormProps) {
  const isReadOnly = !!viewingChannelId;

  return (
    <div className="ms-channel-form">
      <label>
        渠道名称
        <input
          value={channelForm.name}
          readOnly={isReadOnly}
          onChange={(e) => onFormChange({ ...channelForm, name: e.target.value })}
          placeholder="渠道名称"
          className="ms-field"
        />
      </label>
      <label>
        Base URL
        <input
          value={channelForm.baseUrl}
          readOnly={isReadOnly}
          onChange={(e) => onFormChange({ ...channelForm, baseUrl: e.target.value })}
          placeholder="Base URL"
          className="ms-field"
        />
      </label>
      <label>
        API Key
        <SecretInput
          key={`${viewingChannelId || editingChannelId || "new"}-key`}
          value={channelForm.apiKey}
          readOnly={isReadOnly}
          onChange={(value) => onFormChange({ ...channelForm, apiKey: value })}
          placeholder="API Key"
        />
      </label>
      {showProtocol && (
        <label>
          协议类型
          <select
            value={channelForm.api}
            disabled={isReadOnly}
            onChange={(e) => onFormChange({ ...channelForm, api: e.target.value })}
            aria-label="协议类型"
            className="ms-field"
          >
            {PI_FAMILY_API_PROTOCOLS.map((protocol) => (
              <option key={protocol} value={protocol}>
                {PROTOCOL_LABELS[protocol] || protocol}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        默认模型
        <input
          value={channelForm.model}
          readOnly={isReadOnly}
          onChange={(e) => onFormChange({ ...channelForm, model: e.target.value })}
          placeholder="默认模型 ID（可选）"
          className="ms-field"
        />
      </label>
      <div className="ms-form-actions">
        <button type="button" onClick={onCloseForm} className="ms-button">
          {isReadOnly ? "关闭" : "取消"}
        </button>
        {!isReadOnly && (
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
  );
}
