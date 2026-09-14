import { useEffect, useState } from "./react-context";
import { getHostSession, isConcreteModel } from "./selection-policy";
import { findBuiltinTriggerButton, getHostCliMenuProps } from "./sync-host";
import type { CliEngineId, EffortLevel, PluginState } from "./types";

export interface SessionDisplay {
  sessionKey: string;
  selectedCli: CliEngineId;
  selectedModel: string;
  effort: EffortLevel;
  enable1MContext: boolean;
}

export function readSessionDisplay(anchor?: HTMLElement | null): SessionDisplay | null {
  const host = getHostCliMenuProps(anchor);
  const session = host?.session !== undefined ? host.session : getHostSession();
  const engine = session?.engine || host?.value;
  if (!engine) return null;
  // The host has already resolved tab override -> runtime/history -> engine default.
  const matchingHost = host?.value === engine ? host : null;
  const model = session?.model || host?.lastUsedModel || matchingHost?.models?.[engine] || "";
  const effort = (session?.effort as EffortLevel) || host?.lastUsedEffort || (matchingHost?.efforts?.[engine] as EffortLevel) || "high";
  return {
    sessionKey: JSON.stringify([engine, session?.sessionId ?? null, session?.workspacePath ?? "", host?.streaming ?? false, model, effort]),
    selectedCli: engine as CliEngineId,
    selectedModel: isConcreteModel(model) ? model.replace(/\[1m\]$/i, "").trim() : "",
    effort: effort as EffortLevel,
    enable1MContext: /\[1m\]$/i.test(model),
  };
}

export function withSessionDisplay(state: PluginState, display: SessionDisplay | null): PluginState {
  if (!display) return state;
  const { sessionKey: _key, ...selection } = display;
  return {
    ...state,
    ...selection,
    ...(state.selectedCli !== display.selectedCli ? {
      selectedProviderId: "", activeChannelType: "system" as const, activePluginChannelId: undefined,
    } : {}),
  };
}

export function useSessionDisplay(anchor?: { current: HTMLElement | null }): SessionDisplay | null {
  const [display, setDisplay] = useState(() => readSessionDisplay(anchor?.current));
  useEffect(() => {
    let observed: HTMLElement | null = null;
    const observer = new MutationObserver(() => refresh());
    const refresh = () => {
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
    // Same-window storage writes do not emit storage events; also cover remounted triggers.
    const timer = window.setInterval(refresh, 200);
    window.addEventListener("storage", refresh);
    window.addEventListener("ccgui:model-changed", refresh);
    return () => {
      observer.disconnect();
      clearInterval(timer);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("ccgui:model-changed", refresh);
    };
  }, [anchor]);
  return display;
}
