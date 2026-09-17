import { React } from "../react-context";
import type { SystemProviderChannel, CustomPluginChannel } from "../types";
import { ChannelRow } from "./ChannelSection";

interface ChannelListProps {
  channelTab: "system" | "plugin";
  systemChannels: SystemProviderChannel[];
  pluginCustomChannels: CustomPluginChannel[];
  loadingChannels: boolean;
  fetchingModels: boolean;
  selectedChannelId: string | null;
  isPluginActive: boolean;
  channelSupportError?: string | null;
  onSelectSystemProvider: (ch: SystemProviderChannel) => void;
  onSelectPluginChannel: (ch: CustomPluginChannel) => void;
  onViewSystemChannel: (ch: SystemProviderChannel, e: React.MouseEvent) => void;
  onEditPluginChannel: (ch: CustomPluginChannel, e: React.MouseEvent) => void;
  onDeletePluginChannel: (id: string, e: React.MouseEvent) => void;
  channelBrand: (name: string, model?: string, url?: string, isNative?: boolean) => string;
}

export function ChannelList({
  channelTab,
  systemChannels,
  pluginCustomChannels,
  loadingChannels,
  fetchingModels,
  selectedChannelId,
  isPluginActive,
  channelSupportError,
  onSelectSystemProvider,
  onSelectPluginChannel,
  onViewSystemChannel,
  onEditPluginChannel,
  onDeletePluginChannel,
  channelBrand,
}: ChannelListProps) {
  if (channelTab === "system") {
    return (
      <SystemChannelList
        systemChannels={systemChannels}
        loadingChannels={loadingChannels}
        fetchingModels={fetchingModels}
        selectedChannelId={selectedChannelId}
        isPluginActive={isPluginActive}
        channelSupportError={channelSupportError}
        onSelectSystemProvider={onSelectSystemProvider}
        onViewSystemChannel={onViewSystemChannel}
        channelBrand={channelBrand}
      />
    );
  }

  return (
    <PluginChannelList
      pluginCustomChannels={pluginCustomChannels}
      fetchingModels={fetchingModels}
      selectedChannelId={selectedChannelId}
      isPluginActive={isPluginActive}
      channelSupportError={channelSupportError}
      onSelectPluginChannel={onSelectPluginChannel}
      onEditPluginChannel={onEditPluginChannel}
      onDeletePluginChannel={onDeletePluginChannel}
      channelBrand={channelBrand}
    />
  );
}

interface SystemChannelListProps {
  systemChannels: SystemProviderChannel[];
  loadingChannels: boolean;
  fetchingModels: boolean;
  selectedChannelId: string | null;
  isPluginActive: boolean;
  channelSupportError?: string | null;
  onSelectSystemProvider: (ch: SystemProviderChannel) => void;
  onViewSystemChannel: (ch: SystemProviderChannel, e: React.MouseEvent) => void;
  channelBrand: (name: string, model?: string, url?: string, isNative?: boolean) => string;
}

function SystemChannelList({
  systemChannels,
  loadingChannels,
  fetchingModels,
  selectedChannelId,
  isPluginActive,
  channelSupportError,
  onSelectSystemProvider,
  onViewSystemChannel,
  channelBrand,
}: SystemChannelListProps) {
  if (systemChannels.length === 0) {
    return (
      <span className="ms-empty">
        {loadingChannels ? "正在加载…" : "尚未配置系统供应商"}
      </span>
    );
  }

  return (
    <>
      {systemChannels.map((ch) => (
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
      ))}
    </>
  );
}

interface PluginChannelListProps {
  pluginCustomChannels: CustomPluginChannel[];
  fetchingModels: boolean;
  selectedChannelId: string | null;
  isPluginActive: boolean;
  channelSupportError?: string | null;
  onSelectPluginChannel: (ch: CustomPluginChannel) => void;
  onEditPluginChannel: (ch: CustomPluginChannel, e: React.MouseEvent) => void;
  onDeletePluginChannel: (id: string, e: React.MouseEvent) => void;
  channelBrand: (name: string, model?: string, url?: string, isNative?: boolean) => string;
}

function PluginChannelList({
  pluginCustomChannels,
  fetchingModels,
  selectedChannelId,
  isPluginActive,
  channelSupportError,
  onSelectPluginChannel,
  onEditPluginChannel,
  onDeletePluginChannel,
  channelBrand,
}: PluginChannelListProps) {
  if (pluginCustomChannels.length === 0) {
    return <span className="ms-empty">暂无独立渠道</span>;
  }

  return (
    <>
      {pluginCustomChannels.map((ch) => (
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
      ))}
    </>
  );
}
