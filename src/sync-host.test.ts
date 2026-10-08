import { describe, expect, it, vi } from "vitest";
import { findHostChatStoreFromFiber, findHostStoreActionsFromFiber, normalizeEffort, patchHostSessionEffort, patchHostSessionModel, type HostChatStore } from "./sync-host";
import { invokeHost } from "./host-transport";

vi.mock("./host-transport", () => ({
  invokeHost: vi.fn(async () => ({})),
}));

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
  it("已有会话优先调用 store.setEffort 并更新 store 与 IPC", async () => {
    const calls: Array<[string, string]> = [];
    let next: Record<string, unknown> | null = null;
    const store: HostChatStore = {
      getState: () => ({
        active: { engine: "claude", sessionId: "s1", workspacePath: "/ws" },
        bySession: { "claude/s1": { activeEffort: "high" } },
        openTabs: [{ engine: "claude", sessionId: "s1", workspacePath: "/ws" }],
        efforts: { claude: "high" },
        setEffort: (engine, effort) => { calls.push([engine, effort]); },
      }),
      setState: (partial) => {
        next = typeof partial === "function"
          ? partial({
              active: { engine: "claude", sessionId: "s1", workspacePath: "/ws" },
              bySession: { "claude/s1": { activeEffort: "high" } },
              openTabs: [{ engine: "claude", sessionId: "s1", workspacePath: "/ws" }],
              efforts: { claude: "high" },
            })
          : partial;
      },
    };
    expect(await patchHostSessionEffort(store, "claude", "max", {
      engine: "claude", sessionId: "s1", workspacePath: "/ws",
    })).toBe(true);
    expect(calls).toEqual([["claude", "max"]]);
    expect((next as any)?.bySession["claude/s1"].activeEffort).toBe("max");
    expect((next as any)?.efforts.claude).toBe("max");
  });

  it("没有 setEffort 时直接改 bySession.activeEffort 与 efforts", async () => {
    let next: Record<string, unknown> | null = null;
    const store: HostChatStore = {
      getState: () => ({
        active: { engine: "claude", sessionId: "s1", workspacePath: "/ws" },
        bySession: { "claude/s1": { activeEffort: "high" } },
        openTabs: [{ engine: "claude", sessionId: "s1", workspacePath: "/ws" }],
        efforts: { claude: "high" },
      }),
      setState: (partial) => {
        next = typeof partial === "function"
          ? partial({
              active: { engine: "claude", sessionId: "s1", workspacePath: "/ws" },
              bySession: { "claude/s1": { activeEffort: "high" } },
              openTabs: [{ engine: "claude", sessionId: "s1", workspacePath: "/ws" }],
              efforts: { claude: "high" },
            })
          : partial;
      },
    };
    expect(await patchHostSessionEffort(store, "claude", "max", {
      engine: "claude", sessionId: "s1", workspacePath: "/ws",
    })).toBe(true);
    expect((next as { bySession: Record<string, { activeEffort: string }> }).bySession["claude/s1"].activeEffort).toBe("max");
    expect((next as any)?.efforts.claude).toBe("max");
  });
});

describe("patchHostSessionModel", () => {
  it("更新 store active.model, openTabs 与 bySession.activeModel", async () => {
    const calls: Array<[string, string]> = [];
    let patchedState: Record<string, unknown> = {};
    const store: HostChatStore = {
      getState: () => ({
        active: { engine: "claude", sessionId: "s1", workspacePath: "/ws" },
        bySession: { "claude/s1": { activeModel: "claude-sonnet-4-6" } },
        openTabs: [{ engine: "claude", sessionId: "s1", workspacePath: "/ws" }],
        models: { claude: "claude-sonnet-4-6" },
        setModel: (engine, model) => { calls.push([engine, model]); },
      }),
      setState: (partial) => {
        const update = typeof partial === "function"
          ? partial({
              active: { engine: "claude", sessionId: "s1", workspacePath: "/ws" },
              bySession: { "claude/s1": { activeModel: "claude-sonnet-4-6" } },
              openTabs: [{ engine: "claude", sessionId: "s1", workspacePath: "/ws" }],
              models: { claude: "claude-sonnet-4-6" },
            })
          : partial;
        patchedState = { ...patchedState, ...update };
      },
    };

    const success = await patchHostSessionModel(store, "claude", "claude-opus-4-6", {
      engine: "claude",
      sessionId: "s1",
      workspacePath: "/ws",
    });

    expect(success).toBe(true);
    expect(invokeHost).toHaveBeenCalledWith("remember_session_model", {
      engine: "claude",
      sessionId: "s1",
      model: "claude-opus-4-6",
    });
    expect(calls).toEqual([["claude", "claude-opus-4-6"]]);
    const active = patchedState.active;
    if (active && typeof active === "object" && "model" in active) {
      expect(active.model).toBe("claude-opus-4-6");
    } else {
      expect.unreachable("patchedState.active should be an object with model");
    }
    const models = patchedState.models;
    if (models && typeof models === "object" && "claude" in models) {
      expect(models.claude).toBe("claude-opus-4-6");
    } else {
      expect.unreachable("patchedState.models should be an object with claude");
    }
    const bySession = patchedState.bySession;
    if (bySession && typeof bySession === "object" && "claude/s1" in bySession) {
      const s1 = bySession["claude/s1"];
      if (s1 && typeof s1 === "object" && "activeModel" in s1) {
        expect(s1.activeModel).toBe("claude-opus-4-6");
      } else {
        expect.unreachable("s1 should be an object with activeModel");
      }
    } else {
      expect.unreachable("patchedState.bySession should contain claude/s1");
    }
  });
  it("当 enable1M 为 true 时，同步更新 bySession 的 usage.model_context_window 为 1000000", async () => {
    let patchedState: Record<string, unknown> = {
      active: { engine: "omp", sessionId: "s2", workspacePath: "/ws" },
      openTabs: [{ engine: "omp", sessionId: "s2", workspacePath: "/ws" }],
      models: {},
      bySession: { "omp/s2": { activeModel: "gemini-3.8-flash", usage: { input_tokens: 100 } } },
    };
    const store = {
      getState: () => patchedState,
      setState: (fn: (prev: unknown) => Record<string, unknown>) => {
        patchedState = { ...patchedState, ...fn(patchedState) };
      },
    } as unknown as Parameters<typeof patchHostSessionModel>[0];

    const success = await patchHostSessionModel(
      store,
      "omp",
      "gemini-3.8-flash",
      { engine: "omp", sessionId: "s2", workspacePath: "/ws" },
      null,
      true,
    );

    expect(success).toBe(true);
    const bySession = patchedState.bySession as Record<string, Record<string, unknown>>;
    const s2 = bySession["omp/s2"];
    expect(s2.activeModel).toBe("gemini-3.8-flash");
    expect(s2.usage).toEqual({ input_tokens: 100, model_context_window: 1_000_000 });
  });
});
