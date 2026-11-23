import { describe, expect, it, vi } from "vitest";
import { applyModelSelectionToHost, disposeDeferredSelections, findHostChatStoreFromFiber, findHostStoreActionsFromFiber, flushDeferredSelectionsFor, getDeferredSelectionFor, normalizeEffort, patchHostSessionEffort, patchHostSessionModel, subscribeDeferredSelections, type HostChatStore } from "./sync-host";
import { invokeHost } from "./host-transport";

vi.mock("./host-transport", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    invokeHost: vi.fn(async () => ({})),
  };
});

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
    // 已有会话切模型不改写引擎默认模型：新建会话读 models[engine]，改了会和全局渠道错配
    expect(patchedState.models).toBeUndefined();
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
  it("更新模型时不改写引擎上报的 usage.model_context_window（插件覆盖只影响显示兜底）", async () => {
    let patchedState: Record<string, unknown> = {
      active: { engine: "omp", sessionId: "s2", workspacePath: "/ws" },
      openTabs: [{ engine: "omp", sessionId: "s2", workspacePath: "/ws" }],
      models: {},
      bySession: {
        "omp/s2": {
          activeModel: "gemini-3.8-flash",
          usage: { input_tokens: 8_700_000, model_context_window: 8_700_000 },
        },
      },
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
    );

    expect(success).toBe(true);
    const bySession = patchedState.bySession as Record<string, Record<string, unknown>>;
    const s2 = bySession["omp/s2"];
    expect(s2.activeModel).toBe("gemini-3.8-flash");
    // 引擎真实上报的窗口必须原样保留，否则用量条会出现 826% 这类错误
    expect(s2.usage).toEqual({ input_tokens: 8_700_000, model_context_window: 8_700_000 });
  });
});

describe("applyModelSelectionToHost Ultra 模式适配", () => {
  it("当 engine 为 omp 且 effort 为 ultra 时，下发给宿主 store 与 IPC 的 effort 应适配为 max", async () => {
    const calls: Array<[string, string]> = [];
    let patchedState: Record<string, unknown> = {
      active: { engine: "omp", sessionId: "s-omp", workspacePath: "/ws" },
      openTabs: [{ engine: "omp", sessionId: "s-omp", workspacePath: "/ws" }],
      models: {},
      efforts: { omp: "medium" },
      bySession: { "omp/s-omp": { activeModel: "gemini-3.8-flash", activeEffort: "medium" } },
      setEffort: (engine: string, effort: string) => { calls.push([engine, effort]); },
      setModel: () => {},
    };
    const store = {
      getState: () => patchedState,
      setState: (fn: any) => {
        const update = typeof fn === "function" ? fn(patchedState) : fn;
        patchedState = { ...patchedState, ...update };
      },
    } as any;

    // 创建虚拟 DOM 元素用于锚点查找
    const container = document.createElement("div");
    (container as any).__reactFiber$test = {
      memoizedState: {
        memoizedState: { current: store },
        next: null,
      },
    };

    await applyModelSelectionToHost({
      engine: "omp",
      model: "gemini-3.8-flash",
      effort: "ultra",
      anchor: container,
    });

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(([eng, eff]) => eng === "omp" && eff === "max")).toBe(true);
    expect((patchedState.efforts as Record<string, string>).omp).toBe("max");
    const bySession = patchedState.bySession as Record<string, Record<string, unknown>>;
    expect(bySession["omp/s-omp"].activeEffort).toBe("max");
  });

  it("当 engine 为 claude 且 effort 为 ultra 时，保持 ultra 原样下发给宿主", async () => {
    const calls: Array<[string, string]> = [];
    let patchedState: Record<string, unknown> = {
      active: { engine: "claude", sessionId: "s-claude", workspacePath: "/ws" },
      openTabs: [{ engine: "claude", sessionId: "s-claude", workspacePath: "/ws" }],
      models: {},
      efforts: { claude: "medium" },
      bySession: { "claude/s-claude": { activeModel: "claude-sonnet-4-6", activeEffort: "medium" } },
      setEffort: (engine: string, effort: string) => { calls.push([engine, effort]); },
      setModel: () => {},
    };
    const store = {
      getState: () => patchedState,
      setState: (fn: any) => {
        const update = typeof fn === "function" ? fn(patchedState) : fn;
        patchedState = { ...patchedState, ...update };
      },
    } as any;

    const container = document.createElement("div");
    (container as any).__reactFiber$test = {
      memoizedState: {
        memoizedState: { current: store },
        next: null,
      },
    };

    await applyModelSelectionToHost({
      engine: "claude",
      model: "claude-sonnet-4-6",
      effort: "ultra",
      anchor: container,
    });

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(([eng, eff]) => eng === "claude" && eff === "ultra")).toBe(true);
    expect((patchedState.efforts as Record<string, string>).claude).toBe("ultra");
  });

  it("并发调用 applyModelSelectionToHost 时，syncAppSettings 的读取-修改-写入按序串行，不丢前一次引擎修改", async () => {
    let persistedSettings: {
      defaultModels: Record<string, string>;
      defaultEfforts: Record<string, string>;
    } = {
      defaultModels: {},
      defaultEfforts: {},
    };
    let releaseFirstRead!: () => void;
    const firstReadGate = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    let readCount = 0;

    vi.mocked(invokeHost).mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "get_app_settings") {
        readCount += 1;
        if (readCount === 1) {
          await firstReadGate;
        }
        return JSON.parse(JSON.stringify(persistedSettings));
      }
      if (cmd === "update_app_settings") {
        const next = (args?.settings ?? {}) as typeof persistedSettings;
        persistedSettings = JSON.parse(JSON.stringify(next));
        return {};
      }
      return {};
    });

    const p1 = applyModelSelectionToHost({
      engine: "claude",
      model: "claude-sonnet-4-6",
      effort: "high",
    });
    const p2 = applyModelSelectionToHost({
      engine: "omp",
      model: "gemini-3.8-flash",
      effort: "ultra",
    });

    await Promise.resolve();
    await Promise.resolve();
    releaseFirstRead();
    await Promise.all([p1, p2]);

    expect(persistedSettings.defaultModels).toEqual({
      claude: "claude-sonnet-4-6",
      omp: "gemini-3.8-flash",
    });
    expect(persistedSettings.defaultEfforts).toEqual({
      claude: "high",
      omp: "max",
    });
  });
});

describe("本轮生成中的切换不改写当前回合的模型/档位", () => {
  interface FakeSession {
    engine: string;
    sessionId: string;
    workspacePath: string;
    model?: string;
  }
  interface FakeSessionRecord {
    activeModel?: string | null;
    activeEffort?: string | null;
    streaming?: boolean;
    messages?: unknown[];
  }
  interface FakeStoreState {
    active?: FakeSession;
    openTabs?: FakeSession[];
    models?: Record<string, string>;
    efforts?: Record<string, string>;
    bySession?: Record<string, FakeSessionRecord>;
    setModel?: (engine: string, model: string) => unknown;
    setEffort?: (engine: string, effort: string) => unknown;
  }
  type FiberStub = {
    memoizedState: { memoizedState: { current: HostChatStore } };
  };

  function attachStoreFiber(container: HTMLElement, store: HostChatStore): void {
    const node = container as HTMLElement & { __reactFiber$test?: FiberStub };
    node.__reactFiber$test = { memoizedState: { memoizedState: { current: store } } };
  }

  function makeStore(initial: FakeStoreState, options?: { subscribe?: boolean }) {
    let state = initial;
    const listeners = new Set<() => void>();
    const notify = () => {
      for (const listener of [...listeners]) listener();
    };
    const store: HostChatStore = {
      getState: () => state,
      setState: (partial) => {
        const update = typeof partial === "function" ? partial(state) : partial;
        state = { ...state, ...update };
        notify();
      },
    };
    if (options?.subscribe !== false) {
      store.subscribe = (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      };
    }
    return {
      store,
      read: () => state,
      flipStreaming: (key: string, streaming: boolean) => {
        state = {
          ...state,
          bySession: { ...state.bySession, [key]: { ...state.bySession?.[key], streaming } },
        };
        notify();
      },
      removeSession: (key: string) => {
        const bySession = { ...state.bySession };
        delete bySession[key];
        state = { ...state, bySession };
        notify();
      },
    };
  }

  it("patchHostSessionModel 在 streaming 时不写 bySession.activeModel 与 liveSession，也不提前落库", async () => {
    vi.mocked(invokeHost).mockClear();
    const { store, read } = makeStore({
      active: { engine: "claude", sessionId: "s1", workspacePath: "/ws" },
      openTabs: [{ engine: "claude", sessionId: "s1", workspacePath: "/ws" }],
      models: { claude: "claude-sonnet-4-6" },
      bySession: {
        "claude/s1": { activeModel: "claude-sonnet-4-6", messages: [], streaming: true },
      },
    });
    const live = { messages: [], streaming: true, activeModel: "claude-sonnet-4-6" };

    const success = await patchHostSessionModel(
      store,
      "claude",
      "claude-opus-4-6",
      { engine: "claude", sessionId: "s1", workspacePath: "/ws" },
      live,
      true,
    );

    expect(success).toBe(true);
    expect(live.activeModel).toBe("claude-sonnet-4-6");
    expect(read().bySession["claude/s1"].activeModel).toBe("claude-sonnet-4-6");
    expect(read().active.model).toBe("claude-opus-4-6");
    expect(read().openTabs[0].model).toBe("claude-opus-4-6");
    // 数据库留给本轮结束后写，避免旧宿主 refreshSessions 中途刷新 activeModel
    expect(invokeHost).not.toHaveBeenCalledWith("remember_session_model", expect.anything());
  });

  it("applyModelSelectionToHost 在本轮生成中只记录档位，streaming 结束后才写 activeEffort", async () => {
    vi.useFakeTimers();
    vi.mocked(invokeHost).mockClear();
    try {
      const { store, read, flipStreaming } = makeStore({
        active: { engine: "omp", sessionId: "s1", workspacePath: "/ws" },
        openTabs: [{ engine: "omp", sessionId: "s1", workspacePath: "/ws" }],
        models: { omp: "old-model" },
        efforts: { omp: "medium" },
        bySession: {
          "omp/s1": {
            activeModel: "old-model",
            activeEffort: "medium",
            messages: [],
            streaming: true,
          },
        },
        setModel: () => {},
        setEffort: vi.fn(),
      });
      const container = document.createElement("div");
      attachStoreFiber(container, store);

      await applyModelSelectionToHost({
        engine: "omp",
        model: "new-model",
        effort: "max",
        anchor: container,
      });

      // 进行中的回合：模型与档位都保持实际在跑的那一套，而且不提前落库
      expect(read().bySession["omp/s1"].activeModel).toBe("old-model");
      expect(read().bySession["omp/s1"].activeEffort).toBe("medium");
      expect(read().active.model).toBe("new-model");
      expect(read().setEffort).not.toHaveBeenCalled();
      expect(invokeHost).not.toHaveBeenCalledWith("remember_session_model", expect.anything());
      expect(invokeHost).not.toHaveBeenCalledWith("remember_session_effort", expect.anything());

      flipStreaming("omp/s1", false);
      // 订阅在 streaming 翻回 false 的同一刻触发，不依赖 250ms 轮询
      for (let i = 0; i < 10; i++) await Promise.resolve();

      expect(read().bySession["omp/s1"].activeEffort).toBe("max");
      expect(read().bySession["omp/s1"].activeModel).toBe("new-model");
      expect(invokeHost).toHaveBeenCalledWith("remember_session_model", {
        engine: "omp",
        sessionId: "s1",
        model: "new-model",
      });
      expect(invokeHost).toHaveBeenCalledWith("remember_session_effort", {
        engine: "omp",
        sessionId: "s1",
        effort: "max",
      });
    } finally {
      disposeDeferredSelections();
      vi.useRealTimers();
    }
  });

  it("拿不到 store.subscribe 时用轮询兜底，本轮结束后补写档位", async () => {
    vi.useFakeTimers();
    vi.mocked(invokeHost).mockClear();
    try {
      const { store, read, flipStreaming } = makeStore(
        {
          active: { engine: "omp", sessionId: "s1", workspacePath: "/ws" },
          openTabs: [{ engine: "omp", sessionId: "s1", workspacePath: "/ws" }],
          models: { omp: "old-model" },
          efforts: { omp: "medium" },
          bySession: {
            "omp/s1": {
              activeModel: "old-model",
              activeEffort: "medium",
              messages: [],
              streaming: true,
            },
          },
          setModel: () => {},
          setEffort: vi.fn(),
        },
        { subscribe: false },
      );
      const container = document.createElement("div");
      attachStoreFiber(container, store);

      await applyModelSelectionToHost({
        engine: "omp",
        model: "new-model",
        effort: "max",
        anchor: container,
      });
      expect(read().bySession["omp/s1"].activeEffort).toBe("medium");

      flipStreaming("omp/s1", false);
      await vi.advanceTimersByTimeAsync(400);
      for (let i = 0; i < 10; i++) await Promise.resolve();

      expect(read().bySession["omp/s1"].activeEffort).toBe("max");
      expect(read().bySession["omp/s1"].activeModel).toBe("new-model");
    } finally {
      disposeDeferredSelections();
      vi.useRealTimers();
    }
  });

  it("生成中关闭会话时把选择写回数据库，下次打开恢复", async () => {
    vi.useFakeTimers();
    vi.mocked(invokeHost).mockClear();
    try {
      const { store, read, removeSession } = makeStore({
        active: { engine: "omp", sessionId: "s1", workspacePath: "/ws" },
        openTabs: [{ engine: "omp", sessionId: "s1", workspacePath: "/ws" }],
        models: { omp: "old-model" },
        efforts: { omp: "medium" },
        bySession: {
          "omp/s1": {
            activeModel: "old-model",
            activeEffort: "medium",
            messages: [],
            streaming: true,
          },
        },
        setModel: () => {},
        setEffort: vi.fn(),
      });
      const container = document.createElement("div");
      attachStoreFiber(container, store);

      await applyModelSelectionToHost({
        engine: "omp",
        model: "new-model",
        effort: "max",
        anchor: container,
      });
      removeSession("omp/s1");
      for (let i = 0; i < 10; i++) await Promise.resolve();

      expect(read().bySession?.["omp/s1"]).toBeUndefined();
      expect(invokeHost).toHaveBeenCalledWith("remember_session_model", {
        engine: "omp",
        sessionId: "s1",
        model: "new-model",
      });
      expect(invokeHost).toHaveBeenCalledWith("remember_session_effort", {
        engine: "omp",
        sessionId: "s1",
        effort: "max",
      });
    } finally {
      disposeDeferredSelections();
      vi.useRealTimers();
    }
  });

  it("拿不到 store.subscribe 时靠 usage://done 事件落地，不等 250ms 轮询", async () => {
    vi.useFakeTimers();
    vi.mocked(invokeHost).mockClear();
    try {
      const { store, read, flipStreaming } = makeStore(
        {
          active: { engine: "omp", sessionId: "s1", workspacePath: "/ws" },
          openTabs: [{ engine: "omp", sessionId: "s1", workspacePath: "/ws" }],
          models: { omp: "old-model" },
          efforts: { omp: "medium" },
          bySession: {
            "omp/s1": {
              activeModel: "old-model",
              activeEffort: "medium",
              messages: [],
              streaming: true,
            },
          },
          setModel: () => {},
          setEffort: vi.fn(),
        },
        { subscribe: false },
      );
      const container = document.createElement("div");
      attachStoreFiber(container, store);

      await applyModelSelectionToHost({
        engine: "omp",
        model: "new-model",
        effort: "max",
        anchor: container,
      });
      expect(read().bySession["omp/s1"].activeEffort).toBe("medium");
      expect(invokeHost).not.toHaveBeenCalledWith("remember_session_effort", expect.anything());

      // 宿主写完 done（streaming 翻 false）→ 插件收到引擎 done 事件
      flipStreaming("omp/s1", false);
      flushDeferredSelectionsFor({ runId: "r1", sessionId: "s1", engine: "omp", kind: "done", data: {} });
      await vi.advanceTimersByTimeAsync(1);
      for (let i = 0; i < 10; i++) await Promise.resolve();

      expect(read().bySession["omp/s1"].activeEffort).toBe("max");
      expect(read().bySession["omp/s1"].activeModel).toBe("new-model");
      expect(invokeHost).toHaveBeenCalledWith("remember_session_effort", {
        engine: "omp",
        sessionId: "s1",
        effort: "max",
      });
    } finally {
      disposeDeferredSelections();
      vi.useRealTimers();
    }
  });

  it("store 找不到了也能靠 usage://done 落地（只写数据库，不碰内存）", async () => {
    vi.useFakeTimers();
    vi.mocked(invokeHost).mockClear();
    const ACTIVE_KEY = "ccgui-next.activeSession:v1";
    const previous = localStorage.getItem(ACTIVE_KEY);
    try {
      localStorage.setItem(
        ACTIVE_KEY,
        JSON.stringify({ engine: "omp", sessionId: "s1", workspacePath: "/ws" }),
      );
      const container = document.createElement("div");
      // 只有 Fiber 上的会话状态（streaming=true），没有 store
      const node = container as HTMLElement & {
        __reactFiber$test?: { memoizedProps: { session: unknown } };
      };
      node.__reactFiber$test = {
        memoizedProps: { session: { messages: [], streaming: true, activeEffort: "medium" } },
      };

      await applyModelSelectionToHost({
        engine: "omp",
        model: "new-model",
        effort: "max",
        anchor: container,
      });
      expect(invokeHost).not.toHaveBeenCalledWith("remember_session_model", expect.anything());
      expect(invokeHost).not.toHaveBeenCalledWith("remember_session_effort", expect.anything());

      flushDeferredSelectionsFor({ runId: "r1", sessionId: "s1", engine: "omp", kind: "done", data: {} });
      await vi.advanceTimersByTimeAsync(1);
      for (let i = 0; i < 10; i++) await Promise.resolve();

      expect(invokeHost).toHaveBeenCalledWith("remember_session_model", {
        engine: "omp",
        sessionId: "s1",
        model: "new-model",
      });
      expect(invokeHost).toHaveBeenCalledWith("remember_session_effort", {
        engine: "omp",
        sessionId: "s1",
        effort: "max",
      });
    } finally {
      if (previous === null) localStorage.removeItem(ACTIVE_KEY);
      else localStorage.setItem(ACTIVE_KEY, previous);
      disposeDeferredSelections();
      vi.useRealTimers();
    }
  });

  it("生成中刚切的档位对输入框立即可见，落地后清空并通知", async () => {
    vi.useFakeTimers();
    try {
      const { store, read, flipStreaming } = makeStore({
        active: { engine: "omp", sessionId: "s1", workspacePath: "/ws" },
        openTabs: [{ engine: "omp", sessionId: "s1", workspacePath: "/ws" }],
        models: { omp: "old-model" },
        efforts: { omp: "medium" },
        bySession: {
          "omp/s1": {
            activeModel: "old-model",
            activeEffort: "medium",
            messages: [],
            streaming: true,
          },
        },
        setModel: () => {},
        setEffort: vi.fn(),
      });
      const container = document.createElement("div");
      attachStoreFiber(container, store);
      let notified = 0;
      const off = subscribeDeferredSelections(() => {
        notified += 1;
      });
      try {
        expect(getDeferredSelectionFor("omp", "s1", "/ws")).toBeNull();

        await applyModelSelectionToHost({
          engine: "omp",
          model: "new-model",
          effort: "max",
          anchor: container,
        });
        // 首轮选择也会延迟落库；发送守卫必须按完整工作区键读到它。
        expect(getDeferredSelectionFor("omp", "s1", "/ws")).toEqual({ model: "new-model", effort: "max" });
        expect(getDeferredSelectionFor("omp", "s1", "/other")).toBeNull();
        expect(getDeferredSelectionFor("omp", "other", "/ws")).toBeNull();
        expect(notified).toBeGreaterThan(0);

        // 手动终止同样会让 streaming 翻回 false；暂存项落地、移除。
        flipStreaming("omp/s1", false);
        for (let i = 0; i < 10; i++) await Promise.resolve();

        expect(getDeferredSelectionFor("omp", "s1", "/ws")).toBeNull();
        expect(read().bySession?.["omp/s1"]?.activeModel).toBe("new-model");
      } finally {
        off();
      }
    } finally {
      disposeDeferredSelections();
      vi.useRealTimers();
    }
  });

  it("仅更新档位（model: undefined）时绝不清空会话模型，也不会在生成中压入空模型暂存", async () => {
    vi.useFakeTimers();
    vi.mocked(invokeHost).mockClear();
    const setModelSpy = vi.fn();
    try {
      const { store, read, flipStreaming } = makeStore({
        active: { engine: "omp", sessionId: "s1", workspacePath: "/ws", model: "plugin_c1/kimi-k3.1-pro" },
        openTabs: [{ engine: "omp", sessionId: "s1", workspacePath: "/ws", model: "plugin_c1/kimi-k3.1-pro" }],
        models: { omp: "plugin_c1/kimi-k3.1-pro" },
        efforts: { omp: "medium" },
        bySession: {
          "omp/s1": {
            activeModel: "plugin_c1/kimi-k3.1-pro",
            activeEffort: "medium",
            messages: [],
            streaming: true,
          },
        },
        setModel: setModelSpy,
        setEffort: vi.fn(),
      });
      const container = document.createElement("div");
      attachStoreFiber(container, store);

      await applyModelSelectionToHost({
        engine: "omp",
        effort: "max",
        anchor: container,
      });

      expect(setModelSpy).not.toHaveBeenCalled();
      expect(read().active?.model).toBe("plugin_c1/kimi-k3.1-pro");
      expect(read().models?.omp).toBe("plugin_c1/kimi-k3.1-pro");
      expect(getDeferredSelectionFor("omp", "s1", "/ws")).toEqual({ effort: "max" });

      // 手动终止后 streaming 翻回 false：绝不把 activeModel 或 session_models 清空
      flipStreaming("omp/s1", false);
      for (let i = 0; i < 10; i++) await Promise.resolve();

      expect(read().bySession?.["omp/s1"]?.activeModel).toBe("plugin_c1/kimi-k3.1-pro");
      expect(vi.mocked(invokeHost)).not.toHaveBeenCalledWith("remember_session_model", expect.anything());
    } finally {
      disposeDeferredSelections();
      vi.useRealTimers();
    }
  });
});
