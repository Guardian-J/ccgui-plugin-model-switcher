import { useEffect, useState } from "./react-context";
import { getHostSession, isConcreteModel } from "./selection-policy";
import {
  findBuiltinTriggerButton,
  getHostCliMenuProps,
  findHostChatStoreForTrigger,
  getTimelineLastUsed,
  normalizeEffort,
  repairLegacyHostModel,
  type HostCliMenuProps,
  type HostChatStore,
} from "./sync-host";
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

export function readSessionDisplay(
  anchor?: HTMLElement | null,
  preloaded?: { triggerButton?: HTMLElement | null; host?: HostCliMenuProps | null },
): SessionDisplay | null {
  const btn = preloaded?.triggerButton !== undefined
    ? preloaded.triggerButton
    : findBuiltinTriggerButton(anchor);
  const host = preloaded?.host !== undefined
    ? preloaded.host
    : getHostCliMenuProps(anchor, { includeLastUsed: false, triggerButton: btn });
  const session = host?.session !== undefined ? host.session : getHostSession();
  const engine = session?.engine || host?.value;
  if (!engine) return null;
  // The host has already resolved tab override -> runtime/history -> engine default.
  const matchingHost = host?.value === engine ? host : null;
  // 会话级渠道、档位与模型：
  // 1. bySession[sessionKey]（已创建会话的真实 activeModel, activeProvider 和 activeEffort）
  let selectedProviderId = "";
  let sessionActiveEffort: EffortLevel | undefined;
  let sessionActiveModel: string | undefined;
  let tabActiveModel: string | undefined;
  let engineDefaultModel: string | undefined;
  let sessionContextWindow: number | undefined;
  // 从 store / bySession 读取真实状态
  try {
    if (btn) {
      const store = findHostChatStoreForTrigger(btn);
      if (store) {
        const state = store.getState();
        if (state.active && state.active.engine === engine && state.active.model) {
          tabActiveModel = state.active.model.trim();
        }
        const rawDefaultModel = state.models?.[engine];
        if (typeof rawDefaultModel === "string" && rawDefaultModel.trim()) {
          engineDefaultModel = rawDefaultModel.trim();
        }
        if (session?.sessionId) {
          const sessionKey = `${engine}/${session.sessionId}`;
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
            const rawModel = sessionRecord.activeModel;
            if (typeof rawModel === "string" && rawModel.trim()) {
              sessionActiveModel = rawModel.trim();
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
    }
  } catch {
    // 读取失败时降级
  }

  // 模型解析优先级（与宿主 useTabModelDisplay / resolveSessionModel 对齐）：
  // 1. 显式选择（session?.model 或 tabActiveModel）
  // 2. 会话真实 activeModel（bySession[sessionKey].activeModel）
  // 3. 消息历史兜底（host?.lastUsedModel）
  // 4. 宿主计算的当前页签权威模型 / 引擎默认模型
  //
  // 新会话页签（sessionId === null）也必须认引擎默认模型：插件选定模型后会写
  // store.models 与 AppSettings.defaultModels（syncAppSettings），宿主发送时
  // resolveSessionModel 正是用它兜底。只认 active.model 会把"已选模型"
  // 误判成未选择，发送守卫因此永远拦截首条消息。
  // 但连活动页签都没有（session === null）时保持原语义：不把引擎默认当作已选。
  const explicitModel = session?.model || tabActiveModel;
  let lastUsedModel = host?.lastUsedModel;
  let lastUsedEffort = host?.lastUsedEffort;
  if (
    session?.sessionId &&
    ((!explicitModel && !sessionActiveModel && !matchingHost?.models?.[engine] && !lastUsedModel) ||
      (!sessionActiveEffort && !session?.effort && !matchingHost?.efforts?.[engine] && !lastUsedEffort))
  ) {
    const timelineUsed = getTimelineLastUsed();
    if (timelineUsed) {
      if (!lastUsedModel) lastUsedModel = timelineUsed.lastUsedModel;
      if (!lastUsedEffort) lastUsedEffort = timelineUsed.lastUsedEffort;
    }
  }
  const isNewSession = !session?.sessionId && !lastUsedModel && !sessionActiveModel;
  // 引擎默认模型只在确实存在活动页签时才算"已选"；session === null（连新会话
  // 页签都没有）时保持原语义，不把默认模型当作已选。
  const engineModel = session ? (matchingHost?.models?.[engine] || engineDefaultModel || "") : "";
  const model = isNewSession
    ? (explicitModel || engineModel)
    : (explicitModel || sessionActiveModel || lastUsedModel || matchingHost?.models?.[engine] || engineDefaultModel || "");
  // 档位由细到粗：会话真实 activeEffort -> 会话显式 effort -> 消息历史兜底 -> 引擎默认 -> 默认
  const effort = (
    sessionActiveEffort ||
    (session?.effort as EffortLevel) ||
    lastUsedEffort ||
    (matchingHost?.efforts?.[engine] as EffortLevel) ||
    "high"
  );
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
  const { sessionKey: _key, selectedProviderId, effort: displayEffort, ...selection } = display;

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
      const recordPluginCh = state.pluginChannels?.[display.selectedCli]?.find(item => {
        const withPrefix = pluginProviderId(item.id);
        return item.id === sessionRecord.activePluginChannelId
          || withPrefix === sessionRecord.selectedProviderId
          || item.id === sessionRecord.selectedProviderId;
      });
      if (recordPluginCh) {
        activeChannelType = "plugin";
        activePluginChannelId = recordPluginCh.id;
        finalProviderId = pluginProviderId(recordPluginCh.id);
      } else {
        finalProviderId = sessionRecord.selectedProviderId || "";
        activeChannelType = sessionRecord.activeChannelType || (finalProviderId && isPluginProviderId(finalProviderId) ? "plugin" : "system");
        activePluginChannelId = sessionRecord.activePluginChannelId;
      }
    } else if (hasSessionRecords) {
      // 清空后交由宿主重新确定（useSessionDisplay 每秒回读）
      finalProviderId = "";
      activeChannelType = "system";
      activePluginChannelId = undefined;
    } else {
      // 无对话级记录，保留当前状态（loadChannels 可能已回填或用户已选择）
      const fallbackPluginCh = state.pluginChannels?.[display.selectedCli]?.find(item => {
        const withPrefix = pluginProviderId(item.id);
        return item.id === state.activePluginChannelId
          || withPrefix === state.selectedProviderId
          || item.id === state.selectedProviderId;
      });
      if (fallbackPluginCh && (state.activeChannelType === "plugin" || isPluginProviderId(state.selectedProviderId || ""))) {
        activeChannelType = "plugin";
        activePluginChannelId = fallbackPluginCh.id;
        finalProviderId = pluginProviderId(fallbackPluginCh.id);
      } else {
        finalProviderId = state.selectedProviderId || "";
        if (finalProviderId && isPluginProviderId(finalProviderId)) {
          activeChannelType = "plugin";
          activePluginChannelId = state.activePluginChannelId;
        } else {
          activeChannelType = "system";
          activePluginChannelId = undefined;
        }
      }
    }
  }

  return {
    ...state,
    ...selection,
    effort: displayEffort || state.effort || "high",
    selectedProviderId: finalProviderId,
    activeChannelType,
    activePluginChannelId,
  };
}

function isSameSessionDisplay(a: SessionDisplay | null, b: SessionDisplay | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.sessionKey === b.sessionKey &&
    a.stableKey === b.stableKey &&
    a.sessionId === b.sessionId &&
    a.selectedCli === b.selectedCli &&
    a.selectedModel === b.selectedModel &&
    a.effort === b.effort &&
    a.enable1MContext === b.enable1MContext &&
    a.selectedProviderId === b.selectedProviderId
  );
}

export function useSessionDisplay(anchor?: { current: HTMLElement | null }): SessionDisplay | null {
  const [display, setDisplay] = useState(() => readSessionDisplay(anchor?.current));
  useEffect(() => {
    let disposed = false;
    let observed: HTMLElement | null = null;
    let subscribedStore: HostChatStore | null = null;
    let unsubscribeStore: (() => void) | null = null;
    let microtaskQueued = false;
    const observer = new MutationObserver(() => scheduleRefresh());

    const refresh = () => {
      if (disposed) return;
      const anchorEl = anchor?.current;
      const trigger = findBuiltinTriggerButton(anchorEl);
      if (trigger !== observed) {
        observer.disconnect();
        observed = trigger;
        if (trigger) {
          // 只观察 attributes，不观察 subtree 内的 DOM 变动
          // subtree:true 会在 streaming 期间每帧触发，导致高频 Fiber 树扫描
          observer.observe(trigger, { attributes: true, attributeFilter: ["aria-label", "disabled", "data-value"] });
        }
      }
      const store = trigger ? findHostChatStoreForTrigger(trigger) : null;
      if (store !== subscribedStore) {
        unsubscribeStore?.();
        unsubscribeStore = null;
        subscribedStore = store;
        if (store && typeof store.subscribe === "function") {
          unsubscribeStore = store.subscribe(() => scheduleRefresh());
        }
      }
      const host = trigger
        ? getHostCliMenuProps(anchorEl, { includeLastUsed: false, triggerButton: trigger })
        : null;
      repairLegacyHostModel(anchorEl, host);
      const next = readSessionDisplay(anchorEl, { triggerButton: trigger, host });
      setDisplay((prev) => (isSameSessionDisplay(prev, next) ? prev : next));
    };

    const scheduleRefresh = () => {
      if (disposed || microtaskQueued) return;
      microtaskQueued = true;
      queueMicrotask(() => {
        microtaskQueued = false;
        refresh();
      });
    };

    refresh();
    const timer = window.setInterval(refresh, 1500);
    window.addEventListener("storage", scheduleRefresh);
    window.addEventListener("ccgui:model-changed", scheduleRefresh);
    window.addEventListener("ccgui:channel-changed", scheduleRefresh);
    return () => {
      disposed = true;
      observer.disconnect();
      unsubscribeStore?.();
      clearInterval(timer);
      window.removeEventListener("storage", scheduleRefresh);
      window.removeEventListener("ccgui:model-changed", scheduleRefresh);
      window.removeEventListener("ccgui:channel-changed", scheduleRefresh);
    };
  }, [anchor]);
  return display;
}
