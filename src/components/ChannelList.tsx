import { React } from "../react-context";
import type { SystemProviderChannel, CustomPluginChannel } from "../types";
import { pluginProviderId } from "../system-bridge";
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
  onEditHostChannel: (ch: SystemProviderChannel, e: React.MouseEvent) => void;
  onDeleteHostChannel: (id: string, e: React.MouseEvent) => void;
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
  onEditHostChannel,
  onDeleteHostChannel,
  channelBrand,
}: ChannelListProps) {
  if (channelTab === "system") {
    // 系统渠道标签页：显示所有系统渠道（包括原生和非原生）
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
        onEditHostChannel={onEditHostChannel}
        onDeleteHostChannel={onDeleteHostChannel}
        channelBrand={channelBrand}
      />
    );
  }

  // 独立渠道标签页：只显示插件自己维护的渠道（CLI YAML 供应商归系统 tab）
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
  onEditHostChannel: (ch: SystemProviderChannel, e: React.MouseEvent) => void;
  onDeleteHostChannel: (id: string, e: React.MouseEvent) => void;
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
  onEditHostChannel,
  onDeleteHostChannel,
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
          key={`sys:${ch.id}`}
          disabled={fetchingModels}
          selectDisabled={!!channelSupportError && !ch.isNative}
          name={ch.name}
          url={ch.baseUrl}
          detail={ch.remark}
          brand={channelBrand(ch.name, ch.model, ch.baseUrl, ch.isNative)}
          selected={!isPluginActive && ch.id === selectedChannelId}
          channelId={ch.isNative ? undefined : ch.id}
          onSelect={() => onSelectSystemProvider(ch)}
          onView={ch.isNative ? (e) => onViewSystemChannel(ch, e) : undefined}
          onEdit={!ch.isNative && !channelSupportError ? (e) => onEditHostChannel(ch, e) : undefined}
          onDelete={!ch.isNative ? (e) => onDeleteHostChannel(ch.id, e) : undefined}
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
          key={`plugin:${ch.id}`}
          disabled={fetchingModels}
          selectDisabled={!!channelSupportError}
          name={ch.name}
          url={ch.baseUrl}
          brand={channelBrand(ch.name, ch.model, ch.baseUrl)}
          selected={isPluginActive && ch.id === selectedChannelId}
          onSelect={() => onSelectPluginChannel(ch)}
          onDelete={(e) => onDeletePluginChannel(ch.id, e)}
          onEdit={channelSupportError ? undefined : (e) => onEditPluginChannel(ch, e)}
          sourceLabel="插件"
          channelId={pluginProviderId(ch.id)}
        />
      ))}
    </>
  );
}
