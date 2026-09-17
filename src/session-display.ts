import { useEffect, useState } from "./react-context";
import { getHostSession, isConcreteModel } from "./selection-policy";
import { findBuiltinTriggerButton, getHostCliMenuProps, repairLegacyHostModel } from "./sync-host";
import type { CliEngineId, EffortLevel, PluginState } from "./types";
import { isPluginProviderId, pluginProviderId } from "./system-bridge";

export interface SessionDisplay {
  /** 含 streaming 标志，变化时阻止弹窗重挂载 */
  sessionKey: string;
  /** 不含 streaming，仅 engine+sessionId+workspacePath，用于对话级渠道记录的存储键 */
  stableKey: string;
  selectedCli: CliEngineId;
  selectedModel: string;
  effort: EffortLevel;
  enable1MContext: boolean;
  selectedProviderId?: string;
}

export function readSessionDisplay(anchor?: HTMLElement | null): SessionDisplay | null {
  const host = getHostCliMenuProps(anchor);
  const session = host?.session !== undefined ? host.session : getHostSession();
  const engine = session?.engine || host?.value;
  if (!engine) return null;
  // The host has already resolved tab override -> runtime/history -> engine default.
  const matchingHost = host?.value === engine ? host : null;
  // Prefer the mounted tab and the host's resolved selection; raw history is a fallback.
  const model = session?.model || matchingHost?.models?.[engine] || host?.lastUsedModel || "";
  // 已有会话的 tab.effort 会被宿主清空；真正展示/发送的是 displayEfforts（来自 activeEffort）
  const effort = (
    (session?.sessionId == null ? session?.effort as EffortLevel : undefined) ||
    matchingHost?.efforts?.[engine] as EffortLevel ||
    host?.lastUsedEffort ||
    "high"
  );
  const selectedProviderId = session?.provider || matchingHost?.selectedChannels?.[engine] || "";
  return {
    // Selection updates must not remount a flyout whose host/storage writes are still in flight.
    sessionKey: JSON.stringify([engine, session?.sessionId ?? null, session?.workspacePath ?? "", host?.streaming ?? false]),
    // stableKey excludes streaming so it stays constant while a session is open — used as the storage key for per-session channel records.
    stableKey: JSON.stringify([engine, session?.sessionId ?? null, session?.workspacePath ?? ""]),
    selectedCli: engine as CliEngineId,
    selectedModel: isConcreteModel(model) ? model.replace(/\[1m\]$/i, "").trim() : "",
    effort: effort as EffortLevel,
    enable1MContext: engine === "claude" && /\[1m\]$/i.test(model),
    selectedProviderId,
  };
}

export function withSessionDisplay(state: PluginState, display: SessionDisplay | null): PluginState {
  if (!display) return state.selectedCli === "claude" ? state : { ...state, enable1MContext: false };
  const { sessionKey: _key, selectedProviderId, ...selection } = display;

  // 查找插件渠道（如果宿主 selectedProviderId 指向插件渠道）
  const channel = state.pluginChannels?.[display.selectedCli]?.find(item =>
    pluginProviderId(item.id) === selectedProviderId);

  // 引擎切换时必须重置渠道选择
  const engineChanged = state.selectedCli !== display.selectedCli;

  // 确定渠道类型和 ID（优先使用宿主提供的 selectedProviderId）
  let activeChannelType: "system" | "plugin";
  let activePluginChannelId: string | undefined;
  let finalProviderId: string;

  if (selectedProviderId) {
    // 宿主提供了明确的 providerId（来自 session.provider 或 selectedChannels[engine]）
    finalProviderId = selectedProviderId;
    if (isPluginProviderId(selectedProviderId)) {
      activeChannelType = "plugin";
      activePluginChannelId = channel?.id;
    } else {
      activeChannelType = "system";
      activePluginChannelId = undefined;
    }
  } else if (engineChanged) {
    // 引擎切换且宿主未提供 providerId，重置为系统渠道
    finalProviderId = "";
    activeChannelType = "system";
    activePluginChannelId = undefined;
  } else {
    // 宿主未提供 providerId 且未切换引擎，保留插件当前选择（兼容旧版宿主）
    finalProviderId = state.selectedProviderId || "";
    activeChannelType = state.activeChannelType || "system";
    activePluginChannelId = state.activePluginChannelId;
  }

  return {
    ...state,
    ...selection,
    selectedProviderId: finalProviderId,
    activeChannelType,
    activePluginChannelId,
  };
}

export function useSessionDisplay(anchor?: { current: HTMLElement | null }): SessionDisplay | null {
  const [display, setDisplay] = useState(() => readSessionDisplay(anchor?.current));
  useEffect(() => {
    let observed: HTMLElement | null = null;
    let cachedTrigger: HTMLElement | null = null;
    let cacheExpiry = 0;
    const observer = new MutationObserver(() => refresh());

    const refresh = () => {
      repairLegacyHostModel(anchor?.current);
      // 缓存触发按钮引用 1s，避免每次 MutationObserver 回调都重走 Fiber 树扫描
      const now = Date.now();
      if (now > cacheExpiry) {
        cachedTrigger = findBuiltinTriggerButton(anchor?.current);
        cacheExpiry = now + 1000;
      }
      const trigger = cachedTrigger;
      if (trigger !== observed) {
        observer.disconnect();
        observed = trigger;
        if (trigger) {
          // 只观察 attributes，不观察 subtree 内的 DOM 变动
          // subtree:true 会在 streaming 期间每帧触发，导致高频 Fiber 树扫描
          observer.observe(trigger, { attributes: true, attributeFilter: ["aria-label", "disabled", "data-value"] });
        }
      }
      const next = readSessionDisplay(anchor?.current);
      setDisplay(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener("storage", refresh);
    window.addEventListener("ccgui:model-changed", refresh);
    window.addEventListener("ccgui:channel-changed", refresh);
    return () => {
      observer.disconnect();
      clearInterval(timer);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("ccgui:model-changed", refresh);
      window.removeEventListener("ccgui:channel-changed", refresh);
    };
  }, [anchor]);
  return display;
}
