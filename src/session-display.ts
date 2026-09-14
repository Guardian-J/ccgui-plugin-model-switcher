import { useEffect, useState } from "./react-context";
import { getHostSession, isConcreteModel } from "./selection-policy";
import { findBuiltinTriggerButton, getHostCliMenuProps, repairLegacyHostModel } from "./sync-host";
import type { CliEngineId, EffortLevel, PluginState } from "./types";

export interface SessionDisplay {
  sessionKey: string;
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
  // 优先级：Tab 显式指定模型/推理强度 -> 会话历史最后一次请求/运行记录 -> 引擎全局默认
  const model = session?.model || host?.lastUsedModel || matchingHost?.models?.[engine] || "";
  const effort = (session?.effort as EffortLevel) || host?.lastUsedEffort || (matchingHost?.efforts?.[engine] as EffortLevel) || "high";
  const selectedProviderId = session?.provider || matchingHost?.selectedChannels?.[engine] || "";
  return {
    sessionKey: JSON.stringify([engine, session?.sessionId ?? null, session?.workspacePath ?? "", host?.streaming ?? false, model, effort, selectedProviderId]),
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
  return {
    ...state,
    ...selection,
    ...(selectedProviderId ? { selectedProviderId } : {}),
    ...(state.selectedCli !== display.selectedCli ? {
      selectedProviderId: selectedProviderId || "", activeChannelType: "system" as const, activePluginChannelId: undefined,
    } : {}),
  };
}

export function useSessionDisplay(anchor?: { current: HTMLElement | null }): SessionDisplay | null {
  const [display, setDisplay] = useState(() => readSessionDisplay(anchor?.current));
  useEffect(() => {
    let observed: HTMLElement | null = null;
    const observer = new MutationObserver(() => refresh());
    const refresh = () => {
      repairLegacyHostModel(anchor?.current);
      const trigger = findBuiltinTriggerButton(anchor?.current);
      if (trigger !== observed) {
        observer.disconnect();
        observed = trigger;
        if (trigger) observer.observe(trigger, { attributes: true, childList: true, characterData: true, subtree: true });
      }
      const next = readSessionDisplay(anchor?.current);
      setDisplay(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    };
    refresh();
    // 降低定时器轮询频次为 1000ms，优先依赖 MutationObserver 及事件驱动，消除频繁 Fiber 树扫描开销
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
