import * as ReactImport from "react";

type ReactType = typeof ReactImport;

let sharedReact: ReactType | null = null;

export function initReact(_react?: ReactType) {
  // 0.3.0+ 宿主不再通过 ctx.react 传递，React 已全局注入
  sharedReact = ReactImport;
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

export { ReactImport as React };

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
