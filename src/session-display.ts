import { useEffect, useState } from "./react-context";
import { getHostSession, isConcreteModel } from "./selection-policy";
import { findBuiltinTriggerButton, getHostCliMenuProps, findHostChatStoreFromFiber, committedFiber, normalizeEffort } from "./sync-host";
import type { CliEngineId, EffortLevel, PluginState } from "./types";
import { isPluginProviderId, pluginProviderId } from "./system-bridge";

export interface SessionDisplay {
  /** 含 streaming 标志，变化时阻止弹窗重挂载 */
  sessionKey: string;
  /** 不含 streaming，仅 engine+sessionId+workspacePath，用于对话级渠道记录的存储键 */
  stableKey: string;
  sessionId: string | null;
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
  // 新开会话首次对话（sessionId 为空）时不默认选中模型，除非会话自身明确记录了 model
  const isNewSession = !session?.sessionId && !host?.lastUsedModel;
  const model = isNewSession
    ? (session?.model || "")
    : (session?.model || host?.lastUsedModel || matchingHost?.models?.[engine] || "");
  // 会话级渠道与档位：
  // 1. bySession[sessionKey]（已创建会话的真实 activeProvider 和 activeEffort）
  let selectedProviderId = "";
  let sessionActiveEffort: EffortLevel | undefined;
  let sessionContextWindow: number | undefined;
  // 已创建的会话：从 bySession 读取真实状态
  if (session?.sessionId) {
    try {
      const sessionKey = `${engine}/${session.sessionId}`;
      const btn = findBuiltinTriggerButton(anchor);
      if (btn) {
        const fiber = committedFiber(btn);
        const store = findHostChatStoreFromFiber(fiber);
        if (store) {
          const state = store.getState();
          const bySessionState = state.bySession?.[sessionKey];
          if (bySessionState && typeof bySessionState === "object") {
            const sessionRecord = bySessionState as Record<string, unknown>;
            const rawProvider = sessionRecord.activeProvider;
            if (typeof rawProvider === "string") {
              selectedProviderId = rawProvider;
            }
            const rawEffort = sessionRecord.activeEffort;
            if (typeof rawEffort === "string") {
              sessionActiveEffort = normalizeEffort(rawEffort);
            }
            const usage = sessionRecord.usage;
            if (usage && typeof usage === "object") {
              const u = usage as Record<string, unknown>;
              const cw = u.model_context_window ?? u.context_window ?? u.contextWindow;
              if (typeof cw === "number" && cw > 0) {
                sessionContextWindow = cw;
              }
            }
          }
        }
      }
    } catch {
      // 读取失败时降级到 localStorage
    }
  }
  // 档位由细到粗：会话真实 activeEffort -> 会话显式 effort -> 消息历史兜底 -> 引擎默认 -> 默认
  const effort = (
    sessionActiveEffort ||
    (session?.effort as EffortLevel) ||
    host?.lastUsedEffort ||
    (matchingHost?.efforts?.[engine] as EffortLevel) ||
    "high"
  );
  // 兜底：localStorage、props、全局默认
  if (!selectedProviderId) {
    const localStorageSession = getHostSession();
    // 新宿主（无 onChannelChange）自己管理渠道绑定，props 上的 session.provider
    // 可能是早已废弃的历史值；只有旧宿主才认这份会话级绑定
    const legacyBinding = host?.onChannelChange ? session?.provider : undefined;
    selectedProviderId = (
      (localStorageSession?.engine === engine ? localStorageSession?.provider : undefined) ||
      legacyBinding ||
      matchingHost?.selectedChannels?.[engine] ||
      ""
    );
  }

  return {
    // Selection updates must not remount a flyout whose host/storage writes are still in flight.
    sessionKey: JSON.stringify([engine, session?.sessionId ?? null, session?.workspacePath ?? "", host?.streaming ?? false]),
    stableKey: JSON.stringify([engine, session?.sessionId ?? null, session?.workspacePath ?? ""]),
    sessionId: session?.sessionId ?? null,
    selectedCli: engine as CliEngineId,
    selectedModel: isConcreteModel(model) ? model.replace(/\[1m\]$/i, "").trim() : "",
    effort: effort as EffortLevel,
    enable1MContext: (() => {
      if (sessionContextWindow !== undefined) {
        return sessionContextWindow >= 1_000_000;
      }
      if (typeof localStorage !== "undefined" && model) {
        const clean = model.replace(/\[1m\]$/i, "");
        const cached = localStorage.getItem(`ccgui.context-window.${engine}.${model}`) ||
          localStorage.getItem(`ccgui.context-window.${engine}.${clean}[1m]`) ||
          localStorage.getItem(`ccgui.context-window.${engine}.${clean}`);
        const n = Number(cached);
        if (Number.isFinite(n) && n > 0) {
          return n >= 1_000_000;
        }
      }
      return /\[1m\]$/i.test(model);
    })(),
    selectedProviderId,
  };
}
export function withSessionDisplay(state: PluginState, display: SessionDisplay | null): PluginState {
  if (!display) return state;
  const { sessionKey: _key, selectedProviderId, ...selection } = display;

  // 查找插件渠道：尝试完整 providerId 或去掉前缀后的原始 ID
  const channel = state.pluginChannels?.[display.selectedCli]?.find(item => {
    const withPrefix = pluginProviderId(item.id);
    return withPrefix === selectedProviderId || item.id === selectedProviderId;
  });

  // 引擎切换时必须重置渠道选择
  const engineChanged = state.selectedCli !== display.selectedCli;

  // 确定渠道类型和 ID（优先使用宿主提供的 selectedProviderId）
  let activeChannelType: "system" | "plugin";
  let activePluginChannelId: string | undefined;
  let finalProviderId: string;

  if (selectedProviderId) {
    // 宿主提供了明确的 providerId（来自 session.provider 或 selectedChannels[engine]）
    if (channel) {
      // 匹配到插件渠道：使用带前缀的 providerId
      activeChannelType = "plugin";
      activePluginChannelId = channel.id;
      finalProviderId = pluginProviderId(channel.id);
    } else if (isPluginProviderId(selectedProviderId)) {
      // 宿主 providerId 是插件格式但未找到对应渠道
      activeChannelType = "plugin";
      activePluginChannelId = undefined;
      finalProviderId = selectedProviderId;
    } else {
      // 系统渠道
      activeChannelType = "system";
      activePluginChannelId = undefined;
      finalProviderId = selectedProviderId;
    }
  } else if (engineChanged) {
    // 引擎切换且宿主未提供 providerId，重置为系统渠道
    finalProviderId = "";
    activeChannelType = "system";
    activePluginChannelId = undefined;
  } else {
    // 宿主未提供 providerId 且未切换引擎，优先从对话级记录恢复，兜底插件当前选择（兼容旧版宿主）
    const sessionRecord = display.stableKey ? state.sessionChannels?.[display.stableKey] : undefined;
    // 已经在用对话级记录时，"本页签没有记录"就是真的没有：不能拿全局/别的页签的渠道顶上，
    // 否则 flyout 的首次记录写入会把这个错误值固化成本会话的渠道
    const hasSessionRecords = !!state.sessionChannels && Object.keys(state.sessionChannels).length > 0;
    if (sessionRecord) {
      finalProviderId = sessionRecord.selectedProviderId || "";
      activeChannelType = sessionRecord.activeChannelType || "system";
      activePluginChannelId = sessionRecord.activePluginChannelId;
    } else if (hasSessionRecords) {
      // 清空后交由宿主重新确定（useSessionDisplay 每秒回读）
      finalProviderId = "";
      activeChannelType = "system";
      activePluginChannelId = undefined;
    } else {
      // 无对话级记录，保留当前状态（loadChannels 可能已回填或用户已选择）
      finalProviderId = state.selectedProviderId || "";
      // 根据 selectedProviderId 类型确定 activeChannelType，保持状态一致
      if (finalProviderId && isPluginProviderId(finalProviderId)) {
        activeChannelType = "plugin";
        activePluginChannelId = state.activePluginChannelId;
      } else {
        activeChannelType = "system";
        activePluginChannelId = undefined;
      }
    }
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
