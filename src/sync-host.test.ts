import { describe, expect, it } from "vitest";
import { findHostStoreActionsFromFiber, normalizeEffort } from "./sync-host";

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
