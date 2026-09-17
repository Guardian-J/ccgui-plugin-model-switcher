import { describe, expect, it } from "vitest";
import { findHostChatStoreFromFiber, findHostStoreActionsFromFiber, normalizeEffort, patchHostSessionEffort, type HostChatStore } from "./sync-host";

describe("normalizeEffort", () => {
  it("接受 max 和 ultra", () => {
    expect(normalizeEffort("max")).toBe("max");
    expect(normalizeEffort("ultra")).toBe("ultra");
    expect(normalizeEffort("high")).toBe("high");
  });
});

describe("findHostStoreActionsFromFiber", () => {
  it("从 hook 链表找到 setEffort/setModel", () => {
    const actions = {
      setEffort: () => {},
      setModel: () => {},
      pinModels: () => {},
    };
    const fiber = {
      memoizedState: {
        memoizedState: 1,
        next: { memoizedState: actions, next: null },
      },
    };
    expect(findHostStoreActionsFromFiber(fiber)).toBe(actions);
  });

  it("从 useRef.current 找到 actions", () => {
    const actions = { setEffort: () => {}, setModel: () => {}, pinModels: () => {} };
    const fiber = { memoizedState: { memoizedState: { current: actions }, next: null } };
    expect(findHostStoreActionsFromFiber(fiber)).toBe(actions);
  });

  it("忽略缺少 pinModels 的对象", () => {
    const fiber = {
      memoizedState: {
        memoizedState: { setEffort: () => {}, setModel: () => {} },
        next: null,
      },
    };
    expect(findHostStoreActionsFromFiber(fiber)).toBeNull();
  });

  it("忽略没有 setEffort 的对象", () => {
    const fiber = {
      memoizedState: {
        memoizedState: { setModel: () => {}, setActiveEngine: () => {} },
        next: null,
      },
    };
    expect(findHostStoreActionsFromFiber(fiber)).toBeNull();
  });
});

describe("findHostChatStoreFromFiber", () => {
  it("从 useSyncExternalStore 的 queue 找到 store", () => {
    const store: HostChatStore = {
      getState: () => ({
        active: { engine: "claude", sessionId: "s1", workspacePath: "/ws" },
        bySession: { "claude/s1": { activeEffort: "high" } },
      }),
      setState: () => {},
    };
    const fiber = { memoizedState: { queue: store, next: null } };
    expect(findHostChatStoreFromFiber(fiber)).toBe(store);
  });
});

describe("patchHostSessionEffort", () => {
  it("已有会话优先调用 store.setEffort", () => {
    const calls: Array<[string, string]> = [];
    const store: HostChatStore = {
      getState: () => ({
        active: { engine: "claude", sessionId: "s1", workspacePath: "/ws" },
        bySession: { "claude/s1": { activeEffort: "high" } },
        setEffort: (engine, effort) => { calls.push([engine, effort]); },
      }),
      setState: () => {},
    };
    expect(patchHostSessionEffort(store, "claude", "max", null)).toBe(true);
    expect(calls).toEqual([["claude", "max"]]);
  });

  it("没有 setEffort 时直接改 bySession.activeEffort", () => {
    let next: Record<string, unknown> | null = null;
    const store: HostChatStore = {
      getState: () => ({
        active: { engine: "claude", sessionId: "s1", workspacePath: "/ws" },
        bySession: { "claude/s1": { activeEffort: "high" } },
      }),
      setState: (partial) => {
        next = typeof partial === "function"
          ? partial({ bySession: { "claude/s1": { activeEffort: "high" } } })
          : partial;
      },
    };
    expect(patchHostSessionEffort(store, "claude", "max", {
      engine: "claude", sessionId: "s1", workspacePath: "/ws",
    })).toBe(true);
    expect((next as { bySession: Record<string, { activeEffort: string }> }).bySession["claude/s1"].activeEffort).toBe("max");
  });
});
