import type { PluginContext } from "./ccgui-plugin";

type ReactType = PluginContext["react"];

let sharedReact: ReactType | null = null;

export function initReact(react: ReactType) {
  sharedReact = react;
}

export function getReact(): ReactType {
  if (!sharedReact) {
    // 降级兜底：如果 window 上碰巧有 React
    if (typeof window !== "undefined" && (window as unknown as { React?: ReactType }).React) {
      return (window as unknown as { React: ReactType }).React;
    }
    throw new Error("[model-switcher] 插件尚未激活，React 实例尚未绑定");
  }
  return sharedReact;
}

export const React = {
  get createElement() {
    return getReact().createElement;
  },
  get Fragment() {
    return getReact().Fragment;
  },
  get useState() {
    return getReact().useState;
  },
  get useEffect() {
    return getReact().useEffect;
  },
  get useMemo() {
    return getReact().useMemo;
  },
  get useCallback() {
    return getReact().useCallback;
  },
  get useRef() {
    return getReact().useRef;
  },
};

export function useState<T>(initialState: T | (() => T)) {
  return getReact().useState(initialState);
}

export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
  return getReact().useEffect(effect, deps);
}

export function useMemo<T>(factory: () => T, deps: readonly unknown[]) {
  return getReact().useMemo(factory, deps);
}

export function useCallback<T extends (...args: unknown[]) => unknown>(callback: T, deps: readonly unknown[]) {
  return getReact().useCallback(callback, deps);
}

export function useRef<T>(initialValue: T) {
  return getReact().useRef(initialValue);
}
