import type { CliEngineId, EffortLevel } from "./types";
import { getHostSession, sessionSelectionError, modelSelectionError } from "./selection-policy";
import type { HostSession, ModelCompatibility } from "./selection-policy";
import { invokeHost } from "./host-transport";
import { independentChannelError, NATIVE_PROVIDER_ID, LEGACY_NATIVE_PROVIDER_ID } from "./system-bridge";
import type { PluginContext } from "./ccgui-plugin";

interface HostCliMenuCallbacks {
  onModelChange?: (engine: string, model: string) => void;
  onChange?: (engine: string) => void;
  onEffortChange?: (engine: string, effort: string) => void;
  onChannelChange?: (engine: string, channelId: string) => void | Promise<void>;
}

/** ChatConversation 从 useChatStore 取出的 actions；已有会话的 setEffort 会写 bySession.activeEffort。 */
export interface HostStoreActions {
  setEffort: (engine: string, effort: string) => unknown;
  setModel: (engine: string, model: string) => unknown;
  pinModels: unknown;
  setActiveEngine?: (engine: string) => unknown;
}

/** 宿主 zustand store；发请求读 bySession[key].activeEffort。 */
export interface HostChatStore {
  getState: () => {
    active?: HostSession | null;
    bySession?: Record<string, { activeEffort?: string | null; activeModel?: string | null; activeProvider?: string | null; [key: string]: unknown }>;
    efforts?: Record<string, string>;
    models?: Record<string, string>;
    openTabs?: Array<HostSession>;
    setEffort?: (engine: string, effort: string) => unknown;
    setModel?: (engine: string, model: string) => unknown;
    setActiveEngine?: (engine: string) => unknown;
  };
  setState: (
    partial:
      | Record<string, unknown>
      | ((s: Record<string, unknown>) => Record<string, unknown>),
  ) => void;
}

/** MessageTimeline / SessionTimeline 拿到的 bySession 切片，和 store 是同一引用。 */
export interface HostSessionState {
  messages: unknown[];
  streaming: boolean;
  activeEffort?: string | null;
  activeModel?: string | null;
  activeProvider?: string | null;
}

interface HostCliMenuProps extends HostCliMenuCallbacks {
  value?: string;
  models?: Record<string, string>;
  efforts?: Record<string, string>;
  selectedChannels?: Record<string, string>;
  session?: HostSession | null;
  streaming?: boolean;
  lastUsedModel?: string;
  lastUsedEffort?: EffortLevel;
}

export function normalizeEffort(val: unknown): EffortLevel | undefined {
  if (typeof val !== "string") return undefined;
  const s = val.trim().toLowerCase();
  const valid: EffortLevel[] = ["low", "medium", "high", "xhigh", "max", "ultra"];
  if (valid.includes(s as EffortLevel)) {
    return s as EffortLevel;
  }
  for (const level of ["ultra", "xhigh", "high", "medium", "low", "max"] as const) {
    if (s.includes(level)) return level;
  }
  return undefined;
}

function extractSessionLastUsed(rootFiber: unknown): {
  lastUsedModel?: string;
  lastUsedEffort?: EffortLevel;
} | null {
  if (!rootFiber || typeof rootFiber !== "object") return null;

  const queue: unknown[] = [rootFiber];
  const visited = new Set<unknown>();
  let lastUsedModel: string | undefined;
  let lastUsedEffort: EffortLevel | undefined;

  while (queue.length > 0 && visited.size < 160) {
    const node = queue.shift() as {
      child?: unknown;
      sibling?: unknown;
      memoizedProps?: Record<string, unknown>;
      alternate?: unknown;
    } | undefined;
    if (!node || visited.has(node)) continue;
    visited.add(node);

    const props = node.memoizedProps;
    if (props && typeof props === "object") {
      // 1. SessionState 对象 (包含 activeModel, activeEffort, messages 数组)
      const sess = (props.session && typeof props.session === "object" ? props.session : null) as {
        activeModel?: string | null;
        activeEffort?: string | null;
        messages?: Array<{ model?: string; effort?: string; role?: string }>;
      } | null;

      if (sess) {
        if (!lastUsedModel && sess.activeModel) {
          lastUsedModel = sess.activeModel.trim();
        }
        if (!lastUsedEffort && sess.activeEffort) {
          lastUsedEffort = normalizeEffort(sess.activeEffort);
        }
        if (Array.isArray(sess.messages)) {
          for (let i = sess.messages.length - 1; i >= 0; i--) {
            const m = sess.messages[i];
            if (!lastUsedModel && m?.model) {
              lastUsedModel = m.model.trim();
            }
            if (!lastUsedEffort && m?.effort) {
              lastUsedEffort = normalizeEffort(m.effort);
            }
            if (lastUsedModel && lastUsedEffort) break;
          }
        }
      }

      // 2. 直接接收 messages 数组的组件 (如 MessageTimeline)
      if (Array.isArray(props.messages)) {
        const msgs = props.messages as Array<{ model?: string; effort?: string }>;
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          if (!lastUsedModel && m?.model) {
            lastUsedModel = m.model.trim();
          }
          if (!lastUsedEffort && m?.effort) {
            lastUsedEffort = normalizeEffort(m.effort);
          }
          if (lastUsedModel && lastUsedEffort) break;
        }
      }

      // 3. AgentThinking / TurnStatus 思考指示器属性
      if (typeof props.label === "string" || props.variant === "wave" || props.variant === "spin") {
        if (!lastUsedModel && typeof props.model === "string") {
          const match = props.model.match(/模型\s+([^\s·]+)/) || [null, props.model];
          if (match[1]) lastUsedModel = match[1].trim();
        }
        if (!lastUsedEffort && typeof props.effort === "string") {
          lastUsedEffort = normalizeEffort(props.effort);
        }
      }

      if (lastUsedModel && lastUsedEffort) {
        return { lastUsedModel, lastUsedEffort };
      }
    }

    if (node.child) queue.push(node.child);
    if (node.sibling) queue.push(node.sibling);
  }

  return lastUsedModel || lastUsedEffort ? { lastUsedModel, lastUsedEffort } : null;
}

function findTimelineFiber(): unknown {
  if (typeof document === "undefined") return null;
  const selectors = [
    "[data-virtual-inner]",
    "div.overflow-y-auto.overflow-x-hidden",
    ".group.flex.flex-col.text-left",
    "[data-sentinel]",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const fiberKey = Object.keys(el).find(
        (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
      );
      if (fiberKey) {
        return (el as unknown as Record<string, unknown>)[fiberKey];
      }
    }
  }
  return null;
}

/**
 * 从 DOM 中定位原生被隐藏的 CliMenu 按钮
 */
export function committedFiber(element: HTMLElement): any {
  const key = Object.keys(element).find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
  if (!key) return null;
  let fiber = (element as any)[key];
  let root = fiber;
  while (root?.return) root = root.return;
  if (root?.stateNode?.current && root.stateNode.current !== root) fiber = fiber.alternate;
  return fiber;
}

export function findBuiltinTriggerButton(anchor?: HTMLElement | null): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const isCliTrigger = (element: HTMLElement | null) => {
    if (!element) return false;
    let fiber = committedFiber(element);
    for (let depth = 0; fiber && depth < 60; depth++, fiber = fiber.return) {
      if (typeof fiber.memoizedProps?.onModelChange === "function") return true;
    }
    return false;
  };
  const pluginRoot = (typeof document !== "undefined" && typeof document.querySelector === "function")
    ? (document.querySelector('[data-ccgui-plugin-model-switcher="true"]') as HTMLElement | null)
    : null;
  const toolbar = (anchor && typeof anchor.closest === "function" ? anchor.closest("div.select-none") : null) ||
    (pluginRoot && typeof pluginRoot.closest === "function" ? pluginRoot.closest("div.select-none") : null);
  if (toolbar && typeof toolbar.querySelectorAll === "function") {
    for (const button of toolbar.querySelectorAll<HTMLElement>('button:not([data-ccgui-plugin-btn])')) {
      if (isCliTrigger(button)) return button;
    }
  }

  // 1. 通过选择器直接查找紧随在插件按钮前面的同级原生按钮
  const selectorCandidates = [
    'div.select-none > button.group:not([data-ccgui-plugin-btn])[aria-label*=" · "]',
    'div.select-none > button.group:not([data-ccgui-plugin-btn])[aria-label*=" / "]',
    'div.select-none > button[aria-haspopup="dialog"]:not([data-ccgui-plugin-btn])',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="Claude Code"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="Codex CLI"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="Grok CLI"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="Kimi CLI"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="PI CLI"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="OMP CLI"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="DeepSeek"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="MiniMax"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="OpenCode"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="AGY"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="mcode"]',
  ];

  if (typeof document !== "undefined") {
    if (typeof document.querySelectorAll === "function") {
      for (const sel of selectorCandidates) {
        const elements = document.querySelectorAll<HTMLElement>(sel);
        for (const el of elements) {
          if (isCliTrigger(el)) return el;
        }
      }
    } else if (typeof document.querySelector === "function") {
      for (const sel of selectorCandidates) {
        const el = document.querySelector<HTMLElement>(sel);
        if (isCliTrigger(el)) return el;
      }
    }
  }

  // Wrapped/mobile toolbars do not keep the native button as a direct sibling.
  const scope = (pluginRoot && typeof pluginRoot.closest === "function" ? pluginRoot.closest("div.select-none") : null) ||
    (typeof document !== "undefined" && typeof document.querySelector === "function" ? document.querySelector("main") : null) ||
    (typeof document !== "undefined" ? document.body : null);
  if (scope && typeof scope.querySelectorAll === "function") {
    for (const button of scope.querySelectorAll<HTMLElement>('button:not([data-ccgui-plugin-btn])')) {
      if (isCliTrigger(button)) return button;
    }
  }
  return null;
}

/**
 * 遍历 React Fiber 树获取 CliMenu 组件的真实回调函数
 */
export function getHostCliMenuProps(anchor?: HTMLElement | null): HostCliMenuProps | null {
  const btn = findBuiltinTriggerButton(anchor);
  if (!btn) return null;

  let fiber = committedFiber(btn);
  let depth = 0;
  let result: HostCliMenuProps | null = null;
  let lastUsedModel: string | undefined;
  let lastUsedEffort: EffortLevel | undefined;

  while (fiber && depth < 60) {
    const props = fiber.memoizedProps;
    if (!result && props && typeof props.onModelChange === "function") {
      result = {
        onModelChange: props.onModelChange,
        onChange: props.onChange,
        onEffortChange: props.onEffortChange,
        onChannelChange: props.onChannelChange,
        value: props.value,
        models: props.models,
        efforts: props.efforts,
        selectedChannels: props.selectedChannels,
      };
    }
    if (result && props && Object.prototype.hasOwnProperty.call(props, "active") &&
        (props.active === null || typeof props.active?.engine === "string")) {
      result.session = props.active;
      result.streaming = props.streaming === true;
    }

    if ((!lastUsedModel || !lastUsedEffort) && props) {
      const extracted = extractSessionLastUsed(fiber);
      if (extracted?.lastUsedModel && !lastUsedModel) {
        lastUsedModel = extracted.lastUsedModel;
      }
      if (extracted?.lastUsedEffort && !lastUsedEffort) {
        lastUsedEffort = extracted.lastUsedEffort;
      }
    }

    if (result?.session && lastUsedModel && lastUsedEffort) {
      break;
    }

    fiber = fiber.return;
    depth++;
  }

  // 若向上遍历未找齐，尝试从 Timeline 的 DOM Fiber 补充提取
  if (!lastUsedModel || !lastUsedEffort) {
    const timelineFiber = findTimelineFiber();
    if (timelineFiber) {
      const timelineExtracted = extractSessionLastUsed(timelineFiber);
      if (timelineExtracted?.lastUsedModel && !lastUsedModel) {
        lastUsedModel = timelineExtracted.lastUsedModel;
      }
      if (timelineExtracted?.lastUsedEffort && !lastUsedEffort) {
        lastUsedEffort = timelineExtracted.lastUsedEffort;
      }
    }
  }

  if (result) {
    if (lastUsedModel) result.lastUsedModel = lastUsedModel;
    if (lastUsedEffort) result.lastUsedEffort = lastUsedEffort;
  }

  return result;
}

export function hostSessionSelectionError(engine: string): string | null {
  const host = getHostCliMenuProps();
  return sessionSelectionError(engine,
    host?.session !== undefined ? host.session : getHostSession(), host?.streaming);
}

/**
 * 捕获当前宿主会话身份，返回一个校验器。IPC 往返期间用户可能切换页签，
 * 把配置写到已经不是发起方的会话上；在 await 之后调用校验器即可中止后续写入。
 * @param engine 本次操作的目标 CLI
 * @param allowEngineRetarget 模型切换会把待建会话合法改派到目标 CLI，传 true 容许
 *        引擎变为 engine；sessionId/workspacePath 仍必须一致。默认任何变化都算会话已变。
 * @returns 校验器；会话已变化时抛错，未变化则静默返回
 */
export function captureHostSessionGuard(engine: string, allowEngineRetarget = false): () => void {
  const readIdentity = () => {
    const host = getHostCliMenuProps();
    const session = host?.session !== undefined ? host.session : getHostSession();
    return {
      engine: session?.engine ?? null,
      sessionId: session?.sessionId ?? null,
      workspacePath: session?.workspacePath ?? "",
    };
  };
  const original = readIdentity();
  return () => {
    const current = readIdentity();
    const engineRetargeted = allowEngineRetarget && current.engine === engine;
    if (
      (current.engine !== original.engine && !engineRetargeted) ||
      current.sessionId !== original.sessionId ||
      current.workspacePath !== original.workspacePath
    ) {
      throw new Error("当前会话已变化，已停止后续模型切换，请在目标会话重试");
    }
  };
}

/**
 * 检测新版 CC GUI：宿主 props 可读且不含 onChannelChange 才视为新宿主，渠道隔离存储，不写入 CLI 配置文件。
 * props 未就绪（getHostCliMenuProps 返回 null）时保守地返回 false，避免误跳过旧宿主的配置文件写入。
 */
export function isNewHost(): boolean {
  const props = getHostCliMenuProps();
  return props !== null && !props.onChannelChange;
}

function isHostStoreActions(value: unknown): value is HostStoreActions {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.setEffort === "function" && typeof rec.setModel === "function" && typeof rec.pinModels === "function";
}

function isHostChatStore(value: unknown): value is HostChatStore {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  if (typeof rec.getState !== "function" || typeof rec.setState !== "function") return false;
  try {
    const state = (rec.getState as () => unknown)();
    if (!state || typeof state !== "object") return false;
    const s = state as Record<string, unknown>;
    return !!s.bySession && typeof s.bySession === "object" && "active" in s;
  } catch {
    return false;
  }
}

export function isHostSessionState(value: unknown): value is HostSessionState {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return Array.isArray(rec.messages) && typeof rec.streaming === "boolean";
}

function walkHookValues(fiber: { memoizedState?: unknown }, visit: (value: unknown) => boolean): boolean {
  let hook = fiber.memoizedState as { memoizedState?: unknown; queue?: unknown; next?: unknown } | null;
  for (let n = 0; hook && n < 80; n++, hook = (hook.next ?? null) as typeof hook) {
    if (!hook || typeof hook !== "object") break;
    for (const value of [hook.memoizedState, hook.queue, (hook.queue as { getState?: unknown } | undefined)]) {
      if (visit(value)) return true;
      if (value && typeof value === "object") {
        const rec = value as Record<string, unknown>;
        if (visit(rec.current) || visit(rec.getSnapshot) || visit(rec.value) || visit(rec.store)) return true;
      }
    }
  }
  return false;
}

function scanFiberHooks(fiber: { memoizedState?: unknown }): HostStoreActions | null {
  let found: HostStoreActions | null = null;
  walkHookValues(fiber, (value) => {
    if (isHostStoreActions(value)) {
      found = value;
      return true;
    }
    return false;
  });
  return found;
}

function scanFiberStore(fiber: { memoizedState?: unknown }): HostChatStore | null {
  let found: HostChatStore | null = null;
  walkHookValues(fiber, (value) => {
    if (isHostChatStore(value)) {
      found = value;
      return true;
    }
    return false;
  });
  return found;
}

function scanFiberSessionState(fiber: {
  memoizedState?: unknown;
  memoizedProps?: Record<string, unknown>;
}): HostSessionState | null {
  const fromProps = fiber.memoizedProps?.session;
  if (isHostSessionState(fromProps)) return fromProps;
  let found: HostSessionState | null = null;
  walkHookValues(fiber, (value) => {
    if (isHostSessionState(value)) {
      found = value;
      return true;
    }
    return false;
  });
  return found;
}

function bfsSessionState(root: unknown): HostSessionState | null {
  if (!root || typeof root !== "object") return null;
  const queue: unknown[] = [root];
  const visited = new Set<unknown>();
  while (queue.length > 0 && visited.size < 240) {
    const node = queue.shift() as {
      child?: unknown;
      sibling?: unknown;
      memoizedProps?: Record<string, unknown>;
      memoizedState?: unknown;
    } | undefined;
    if (!node || visited.has(node)) continue;
    visited.add(node);
    const found = scanFiberSessionState(node);
    if (found) return found;
    if (node.child) queue.push(node.child);
    if (node.sibling) queue.push(node.sibling);
  }
  return null;
}

/** 从 Fiber 链上找宿主 zustand actions；测试可直接喂假 hook 链表。 */
export function findHostStoreActionsFromFiber(
  fiber: { return?: unknown; memoizedState?: unknown } | null,
): HostStoreActions | null {
  for (let depth = 0; fiber && depth < 80; depth++, fiber = (fiber.return ?? null) as typeof fiber) {
    const found = scanFiberHooks(fiber);
    if (found) return found;
  }
  return null;
}

export function findHostChatStoreFromFiber(
  fiber: { return?: unknown; memoizedState?: unknown } | null,
): HostChatStore | null {
  for (let depth = 0; fiber && depth < 80; depth++, fiber = (fiber.return ?? null) as typeof fiber) {
    const found = scanFiberStore(fiber);
    if (found) return found;
  }
  return null;
}

/** 从 Fiber 找到宿主 bySession 切片；和 sendPrompt 读的是同一对象。 */
export function findHostSessionStateFromFiber(
  fiber: { return?: unknown; memoizedState?: unknown; memoizedProps?: Record<string, unknown> } | null,
): HostSessionState | null {
  for (let depth = 0; fiber && depth < 80; depth++, fiber = (fiber.return ?? null) as typeof fiber) {
    const found = bfsSessionState(fiber);
    if (found) return found;
  }
  return null;
}

function hostFiberStarts(anchor?: HTMLElement | null): Array<HTMLElement | null> {
  return [
    findBuiltinTriggerButton(anchor),
    anchor ?? null,
    typeof document === "undefined" ? null : document.querySelector('[data-ccgui-plugin-model-switcher="true"]'),
  ];
}

/**
 * 从隐藏的原生 CliMenu 向上找到 ChatConversation 的 zustand actions。
 * Fiber 上的 onEffortChange 只保证触发 UI 回调；已有会话发请求读的是 setEffort 写入的 activeEffort。
 */
function findHostStoreActions(anchor?: HTMLElement | null): HostStoreActions | null {
  for (const el of hostFiberStarts(anchor)) {
    if (!el) continue;
    const found = findHostStoreActionsFromFiber(committedFiber(el));
    if (found) return found;
  }
  return null;
}

function findHostChatStore(anchor?: HTMLElement | null): HostChatStore | null {
  for (const el of hostFiberStarts(anchor)) {
    if (!el) continue;
    const found = findHostChatStoreFromFiber(committedFiber(el));
    if (found) return found;
  }
  return null;
}

function findHostSessionState(anchor?: HTMLElement | null): HostSessionState | null {
  for (const el of hostFiberStarts(anchor)) {
    if (!el) continue;
    const found = findHostSessionStateFromFiber(committedFiber(el));
    if (found) return found;
  }
  const timeline = findTimelineFiber();
  if (timeline) {
    const found = findHostSessionStateFromFiber(
      timeline as { return?: unknown; memoizedState?: unknown; memoizedProps?: Record<string, unknown> },
    );
    if (found) return found;
  }
  return null;
}

function sessionStoreKey(engine: string, sessionId: string | null, workspacePath: string): string {
  return sessionId ? `${engine}/${sessionId}` : `new:${engine}:${workspacePath}`;
}

/** 从宿主 store 的 bySession 读取指定会话的状态（包含 activeProvider） */
export function getHostSessionState(sessionKey: string): HostSessionState | null {
  try {
    const store = findHostChatStore();
    if (!store) return null;
    const state = store.getState();
    return (state.bySession?.[sessionKey] as HostSessionState | undefined) ?? null;
  } catch {
    return null;
  }
}

let lastDiagnostic = "";

export function getLastDiagnostic(): string {
  return lastDiagnostic;
}

/**
 * 已有会话的推理强度 patch 入口：优先走官方 ctx.sessions.setEffort（权限
 * host:session，SDK 0.3.10 起）直写宿主会话状态并持久化；ctx 未传入、
 * 宿主是不支持该方法的旧版本，或调用本身失败时，才 fallback 到
 * patchHostSessionEffort 的 Fiber 猜测逻辑。
 *
 * 只处理"已有会话"（session.sessionId 非空）；新会话没有 sessionId，
 * setEffort 会直接 reject（宿主拒绝为不存在的会话造幽灵条目），继续走
 * fallback 让 applyModelSelectionToHost 改引擎默认 effort。
 */
async function patchSessionEffort(
  ctx: PluginContext | undefined,
  store: HostChatStore | null,
  engine: string,
  effort: string,
  session: HostSession | null,
  live?: HostSessionState | null,
): Promise<boolean> {
  console.warn(`[model-switcher] ===== patchSessionEffort 开始 =====`);
  console.warn(`[model-switcher] 入参: engine=${engine}, effort=${effort}, sessionId=${session?.sessionId}, ctx.sessions=${ctx?.sessions ? "✓" : "✗"}`);

  if (ctx?.sessions?.setEffort && session?.sessionId) {
    try {
      const ws = session.workspacePath || "";
      console.warn(`[model-switcher] 调用 ctx.sessions.setEffort(${engine}, ${session.sessionId}, ${ws}, ${effort})`);
      try {
        await (ctx.sessions.setEffort as any)(engine, session.sessionId, ws, effort);
      } catch (e1) {
        await (ctx.sessions.setEffort as any)({
          engine,
          sessionId: session.sessionId,
          workspacePath: ws,
          effort,
        });
      }
      const msg = `ctx.sessions.setEffort(${engine}, ${session.sessionId}, ${effort})`;
      console.warn(`[model-switcher] ✓ ${msg} 成功`);
      lastDiagnostic = msg;
    } catch (err) {
      console.warn(`[model-switcher] ctx.sessions.setEffort 失败，fallback 到底层 patch:`, err);
    }
  }
  const result = await patchHostSessionEffort(store, engine, effort, session, live);
  console.warn(`[model-switcher] ===== patchSessionEffort 完成 (结果=${result}) =====`);
  return result;
}

/**
 * 针对宿主 1.1.x 的会话级推理强度同步与持久化：
 * 1. 若为已有会话（sessionId 存在），调用宿主 IPC remember_session_effort 持久化到 SQLite session_efforts 表；
 * 2. 同步 liveSession.activeEffort 内存引用；
 * 3. 同步更新宿主 store 状态（active.effort, openTabs[].effort, bySession[key].activeEffort, efforts[engine]）；
 * 4. 优先调用 store.getState().setEffort 触发宿主自身的内部派发与监听。
 */
export async function patchHostSessionEffort(
  store: HostChatStore | null,
  engine: string,
  effort: string,
  session: HostSession | null,
  live?: HostSessionState | null,
): Promise<boolean> {
  const sessionId = session?.sessionId ?? null;
  console.warn(`[model-switcher] patchHostSessionEffort 入参: store=${store ? "✓" : "✗"}, live=${live ? "✓" : "✗"}, sessionId=${sessionId ?? "null"}`);

  // 1. 若为已有会话，调用宿主 IPC remember_session_effort 持久化到 SQLite
  if (sessionId) {
    try {
      await invokeHost("remember_session_effort", {
        engine,
        sessionId,
        effort,
      });
      console.warn(`[model-switcher] 已调用 remember_session_effort(${engine}, ${sessionId}, ${effort})`);
    } catch (err) {
      console.warn(`[model-switcher] 调用 remember_session_effort 失败:`, err);
    }
  }

  // 2. 同步 liveSession 内存引用
  if (live) {
    live.activeEffort = effort;
  }

  // 3. 更新宿主 zustand store
  if (store) {
    try {
      const state = store.getState();
      const currentActive = session ?? state.active ?? null;

      if (typeof state.setEffort === "function") {
        try {
          await Promise.resolve(state.setEffort(engine, effort));
        } catch (err) {
          console.warn(`[model-switcher] 调用 store.setEffort 失败:`, err);
        }
      }

      store.setState((prev) => {
        const s = prev as Record<string, unknown>;
        const patch: Record<string, unknown> = {};
        if (currentActive && currentActive.engine === engine) {
          patch.active = { ...currentActive, effort };
        }
        if (Array.isArray(s.openTabs)) {
          patch.openTabs = (s.openTabs as HostSession[]).map((tab) => {
            if (
              tab &&
              typeof tab === "object" &&
              tab.engine === engine &&
              (sessionId ? tab.sessionId === sessionId : tab.sessionId === null)
            ) {
              return { ...tab, effort };
            }
            return tab;
          });
        }
        if (s.efforts && typeof s.efforts === "object") {
          const rawEfforts = s.efforts as Record<string, string>;
          const nextEfforts: Record<string, string> = { ...rawEfforts, [engine]: effort };
          patch.efforts = nextEfforts;
        }
        const key = sessionStoreKey(engine, sessionId, currentActive?.workspacePath || "");
        const rawBySession = s.bySession as Record<string, Record<string, unknown>> | undefined;
        const bySession: Record<string, Record<string, unknown>> = { ...(rawBySession || {}) };
        const cur = bySession[key] ? { ...bySession[key] } : {};
        cur.activeEffort = effort;
        bySession[key] = cur;
        patch.bySession = bySession;
        return patch;
      });
      return true;
    } catch (err) {
      console.warn(`[model-switcher] store.setState patch effort 失败:`, err);
    }
  }
  return false;
}

/**
 * 针对宿主 1.1.x 的会话级模型同步与持久化：
 * 1. 若为已有会话（sessionId 存在），调用宿主 remember_session_model 持久化到 SQLite session_models 表，
 *    防止 refreshSessions / 扫描时用旧 SQLite 记录覆盖；
 * 2. 同步 liveSession.activeModel 内存引用；
 * 3. 同步更新宿主 store 状态（active.model, openTabs[].model, bySession[key].activeModel, models[engine]）；
 * 4. 优先调用 store.getState().setModel 触发宿主自身的内部派发与监听。
 */
export async function patchHostSessionModel(
  store: HostChatStore | null,
  engine: string,
  model: string,
  session: HostSession | null,
  live?: HostSessionState | null,
  enable1M?: boolean,
): Promise<boolean> {
  const sessionId = session?.sessionId ?? null;

  // 1. 若为已有会话，调用宿主 IPC remember_session_model 持久化到 SQLite
  if (sessionId) {
    try {
      await invokeHost("remember_session_model", {
        engine,
        sessionId,
        model,
      });
      console.warn(`[model-switcher] 已调用 remember_session_model(${engine}, ${sessionId}, ${model})`);
    } catch (err) {
      console.warn(`[model-switcher] 调用 remember_session_model 失败:`, err);
    }
  }

  // 2. 同步 liveSession 内存引用
  if (live) {
    live.activeModel = model || null;
  }

  // 3. 更新宿主 zustand store
  if (store) {
    try {
      const state = store.getState();
      const currentActive = session ?? state.active ?? null;

      if (typeof state.setModel === "function") {
        try {
          await Promise.resolve(state.setModel(engine, model));
        } catch (err) {
          console.warn(`[model-switcher] 调用 store.setModel 失败:`, err);
        }
      }

      store.setState((prev) => {
        const s = prev as Record<string, unknown>;
        const patch: Record<string, unknown> = {};
        if (currentActive && currentActive.engine === engine) {
          patch.active = { ...currentActive, model: model || undefined };
        }
        if (Array.isArray(s.openTabs)) {
          patch.openTabs = (s.openTabs as HostSession[]).map((tab) => {
            if (
              tab &&
              typeof tab === "object" &&
              tab.engine === engine &&
              (sessionId ? tab.sessionId === sessionId : tab.sessionId === null)
            ) {
              return { ...tab, model: model || undefined };
            }
            return tab;
          });
        }
        if (s.models && typeof s.models === "object") {
          const rawModels = s.models as Record<string, string>;
          const nextModels: Record<string, string> = { ...rawModels };
          if (model) nextModels[engine] = model;
          else delete nextModels[engine];
          patch.models = nextModels;
        }
        if (sessionId) {
          const key = sessionStoreKey(engine, sessionId, currentActive?.workspacePath || "");
          const rawBySession = s.bySession as Record<string, Record<string, unknown>> | undefined;
          const bySession: Record<string, Record<string, unknown>> = { ...(rawBySession || {}) };
          const cur = bySession[key] ? { ...bySession[key] } : {};
          cur.activeModel = model || null;
          if (enable1M !== undefined) {
            const rawUsage = cur.usage && typeof cur.usage === "object" ? (cur.usage as Record<string, unknown>) : {};
            const windowSize = enable1M ? 1_000_000 : 200_000;
            cur.usage = { ...rawUsage, model_context_window: windowSize };
          }
          bySession[key] = cur;
          patch.bySession = bySession;
        }
        return patch;
      });
      return true;
    } catch (err) {
      console.warn(`[model-switcher] store.setState patch model 失败:`, err);
    }
  }
  return false;
}

/**
 * 同步更新本地存储中的 activeSession 与 openTabs 中的模型/推理强度
 */
function syncLocalStorage(engine: string, model: string, effort: string) {
  if (typeof localStorage === "undefined") return;

  const ACTIVE_KEY = "ccgui-next.activeSession:v1";
  const TABS_KEY = "ccgui-next.openTabs:v1";
  const ENGINE_KEY = "ccgui-next.enginePref";

  try {
    localStorage.setItem(ENGINE_KEY, JSON.stringify(engine));

    const activeRaw = localStorage.getItem(ACTIVE_KEY);
    if (activeRaw) {
      const active = JSON.parse(activeRaw);
      if (active && typeof active === "object") {
        if (active.engine !== engine) return;
        active.model = model || undefined;
        active.effort = effort || undefined;
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
      }
    }

    const tabsRaw = localStorage.getItem(TABS_KEY);
    if (tabsRaw) {
      const tabs = JSON.parse(tabsRaw);
      if (Array.isArray(tabs)) {
        for (const tab of tabs) {
          const active = getHostSession();
          if (active && tab && tab.engine === engine &&
              tab.sessionId === active.sessionId && tab.workspacePath === active.workspacePath) {
            tab.model = model || undefined;
            tab.effort = effort || undefined;
          }
        }
        localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
      }
    }
  } catch (err) {
    console.warn("[model-switcher] 同步 localStorage 失败:", err);
  }
}

/**
 * 同步到系统底层 AppSettings（defaultModels、defaultEfforts）
 */
async function syncAppSettings(engine: string, model: string, effort: string) {
  try {
    // 获取当前设置
    const settings = (await invokeHost("get_app_settings")) as {
      defaultModels?: Record<string, string>;
      defaultEfforts?: Record<string, string>;
      [key: string]: unknown;
    };

    if (settings && typeof settings === "object") {
      const defaultModels = { ...(settings.defaultModels || {}) };
      const defaultEfforts = { ...(settings.defaultEfforts || {}) };

      if (model) {
        defaultModels[engine] = model;
      } else {
        delete defaultModels[engine];
      }
      if (effort) {
        defaultEfforts[engine] = effort;
      }

      settings.defaultModels = defaultModels;
      settings.defaultEfforts = defaultEfforts;

      await invokeHost("update_app_settings", { settings });
    }
  } catch (err) {
    throw new Error(`保存 CLI 默认配置失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 将插件中选中的 CLI、模型及推理强度直接应用并生效到主项目工程：
 * 1. 触发宿主组件在内存中的 setModel/setActiveEngine/setEffort；
 * 2. 同步底层持久化配置（AppSettings + localStorage）；
 * 3. 派发全局通知事件。
 */
export async function applyModelSelectionToHost(params: {
  engine: CliEngineId;
  model: string;
  effort?: EffortLevel;
  enable1M?: boolean;
  compatibility?: ModelCompatibility;
  /** 传入后优先走官方 ctx.sessions.setEffort（权限 host:session，SDK
   *  0.3.10 起）patch 已有会话的推理强度，失败/不可用才 fallback 到
   *  Fiber 猜测。省略时直接走 fallback（兼容未传 ctx 的旧调用点）。 */
  ctx?: PluginContext;
  anchor?: HTMLElement | null;
}): Promise<void> {
  const error = hostSessionSelectionError(params.engine) ||
    (params.model ? modelSelectionError(params.engine, params.model, params.compatibility) : null);
  if (error) throw new Error(error);
  const { engine, effort, enable1M = false } = params;
  let finalModel = params.model.trim();
  if (finalModel === "default") {
    finalModel = "";
  }
  if (finalModel) {
    finalModel = finalModel.replace(/\[1m\]$/i, "");
    const effective1M = (engine === "claude" || engine === "codex" || engine === "omp" || engine === "pi") && enable1M;
    if (effective1M && engine === "claude") finalModel = `${finalModel}[1m]`;
    if (typeof localStorage !== "undefined") {
      try {
        const windowSize = effective1M ? "1000000" : "200000";
        const bare = finalModel.replace(/\[1m\]$/i, "");
        localStorage.setItem(`ccgui.context-window.${engine}.${finalModel}`, windowSize);
        if (bare) {
          localStorage.setItem(`ccgui.context-window.${engine}.${bare}`, windowSize);
        }
      } catch { /* ignore storage errors */ }
    }
  }
  // 针对 OMP / PI 引擎进行 Ultra 模式适配：
  // 宿主 1.1.2 移除了 ultra->max 截断直接向 CLI 下发 --thinking ultra，导致 OMP 报错退出（Invalid --thinking value: "ultra"）。
  // 当为 OMP 或 PI 引擎且选择 ultra 时，下发给宿主运行时的推理强度适配为 "max"（最高强度）。
  const effectiveHostEffort = (effort === "ultra" && (engine === "omp" || engine === "pi"))
    ? "max"
    : effort;

  // 在任何宿主改动之前取快照：模型切换允许把待建会话改派到 engine，但不允许换页签
  const guardHostSession = captureHostSessionGuard(engine, true);
  const callbacks = getHostCliMenuProps(params.anchor);
  const store = findHostChatStore(params.anchor);
  const actions = findHostStoreActions(params.anchor);
  const active = callbacks?.session !== undefined ? callbacks.session : (store?.getState().active ?? getHostSession());
  const liveSession = active?.sessionId ? findHostSessionState(params.anchor) : null;

  // 详细日志：当前状态
  const storeState = store?.getState();
  const currentStoreEffort = storeState?.efforts?.[engine];
  const sessionKey = active?.sessionId ? `${engine}/${active.sessionId}` : null;
  const bySessionEffort = sessionKey ? (storeState?.bySession as any)?.[sessionKey]?.activeEffort : null;
  const liveEffort = liveSession?.activeEffort;

  console.warn(`[model-switcher] ========== 档位切换开始 ==========`);
  console.warn(`[model-switcher] 目标: ${engine} / ${finalModel} / effort=${effort ?? "无"}`);
  console.warn(`[model-switcher] 会话: sessionId=${active?.sessionId ?? "null"}, isNewSession=${!active?.sessionId}`);
  console.warn(`[model-switcher] 当前状态: store.efforts[${engine}]=${currentStoreEffort}, bySession[${sessionKey}].activeEffort=${bySessionEffort}, liveSession.activeEffort=${liveEffort}`);
  console.warn(`[model-switcher] 组件: store=${store ? "✓" : "✗"}, liveSession=${liveSession ? "✓" : "✗"}, ctx.sessions=${params.ctx?.sessions ? "✓" : "✗"}`);

  lastDiagnostic = `sessionId=${active?.sessionId ?? "null"} liveSession=${liveSession ? "✓" : "✗"} store=${store ? "✓" : "✗"}`;
  let patched = false;
  // 已有会话直接改 SessionState（避免 setEffort 触发 refreshSessions 覆盖）；新会话改引擎默认
  try {
    const storeSetActiveEngine = store?.getState().setActiveEngine;
    if (typeof storeSetActiveEngine === "function") {
      try {
        storeSetActiveEngine(engine);
      } catch (e) {
        console.warn("[model-switcher] store.setActiveEngine 失败:", e);
      }
    }
    if (actions?.setActiveEngine) {
      actions.setActiveEngine(engine);
    } else if (callbacks?.onChange) {
      callbacks.onChange(engine);
    }
    // 宿主可能拒绝改派刚发出第一轮请求的待建会话。上面的 active 是切换前的快照，
    // 判断切换是否生效必须重读宿主刚写回的会话状态。
    const switched = getHostSession();
    if (callbacks?.value !== engine && switched && switched.engine !== engine) {
      throw new Error("当前会话未切换到目标 CLI，请等待当前请求结束后重试");
    }
    // 引擎切换后才写 localStorage：syncLocalStorage 只认 engine 已对齐的会话，
    // 放在切换之前会让跨 CLI 切换的 model/effort 被整段跳过。
    if (effectiveHostEffort) syncLocalStorage(engine, finalModel, effectiveHostEffort);
    else syncLocalStorage(engine, finalModel, active?.effort || "");
    // 模型切换：调用 setModel 并打补丁同步到 store / SQLite
    const storeSetModel = store?.getState().setModel;
    if (typeof storeSetModel === "function") {
      try {
        await Promise.resolve(storeSetModel(engine, finalModel));
      } catch (e) {
        console.warn("[model-switcher] store.setModel 失败:", e);
      }
    }
    if (actions?.setModel) {
      await Promise.resolve(actions.setModel(engine, finalModel));
    } else if (callbacks?.onModelChange) {
      callbacks.onModelChange(engine, finalModel);
    }
    await patchHostSessionModel(store, engine, finalModel, active, liveSession, enable1M);
    // 档位处理：新会话与已有会话全链路对齐与持久化
    if (effectiveHostEffort) {
      console.warn(`[model-switcher] 同步生效推理强度: ${engine} -> ${effectiveHostEffort}${effort !== effectiveHostEffort ? ` (原始请求: ${effort})` : ""}`);
      const storeSetEffort = store?.getState().setEffort;
      if (typeof storeSetEffort === "function") {
        try {
          await Promise.resolve(storeSetEffort(engine, effectiveHostEffort));
        } catch (e) {
          console.warn("[model-switcher] store.setEffort 失败:", e);
        }
      }
      if (actions?.setEffort) {
        await Promise.resolve(actions.setEffort(engine, effectiveHostEffort));
      } else if (callbacks?.onEffortChange) {
        callbacks.onEffortChange(engine, effectiveHostEffort);
      }
      patched = await patchSessionEffort(params.ctx, store, engine, effectiveHostEffort, active, liveSession);
    }
  } catch (err) {
    console.warn("[model-switcher] 触发宿主切换失败:", err);
    throw err;
  }

  if (!actions && !callbacks && active && active.engine !== engine) {
    throw new Error("无法连接宿主 CLI 切换入口，请重载插件后重试");
  }
  if (effort && !patched && active?.sessionId) {
    // 已有会话 effort patch 失败时仅记录警告，不阻断渠道/模型切换
    console.warn("[model-switcher] 已有会话 effort patch 失败，渠道切换继续执行");
  }

  // 3. 同步写入系统后端 AppSettings（确保新会话与默认配置生效）
  //    IPC 期间用户可能切走页签，写入前确认还是发起时那个会话（引擎已合法改派到 engine 除外）
  guardHostSession();
  await syncAppSettings(engine, finalModel, effectiveHostEffort ?? "");
  console.warn(`[model-switcher] 已写入 AppSettings: defaultEfforts[${engine}]=${effectiveHostEffort ?? ""}`);

  // 4. 已有会话切换档位后，同步更新宿主 store 的内存状态 efforts[engine]
  //    确保后续新会话能读取到正确的默认档位
  if (effectiveHostEffort && active?.sessionId && store) {
    try {
      const state = store.getState();
      const oldEffort = state.efforts?.[engine];
      store.setState({ efforts: { ...state.efforts, [engine]: effectiveHostEffort } });
      const newState = store.getState();
      const updatedEffort = newState.efforts?.[engine];
      console.warn(`[model-switcher] 已同步更新 store.efforts[${engine}]: ${oldEffort} → ${updatedEffort}`);

      // 验证 bySession 是否正确更新
      const key = `${engine}/${active.sessionId}`;
      const bySessionEffort = (newState.bySession as any)?.[key]?.activeEffort;
      console.warn(`[model-switcher] 验证: bySession[${key}].activeEffort = ${bySessionEffort}`);
    } catch (err) {
      console.warn("[model-switcher] 同步 store.efforts 失败:", err);
    }
  }
  console.warn(`[model-switcher] ========== 档位切换完成 ==========`);

  // 5. 派发通知事件
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ccgui:model-changed", { detail: { engine, model: finalModel, effort } }));
  }
}
/**
 * 修复旧版在 omp/pi 等非 Claude CLI 模型选择中误写入的 [1m] 后缀。
 * [1m] 是 Claude CLI 专用的模型选择器，其他 CLI 不认，会导致启动报 Model not found 错误。
 */
export async function repairLegacyContextSelections(): Promise<void> {
  const strip = (engine: string, model: unknown) =>
    engine !== "claude" && typeof model === "string" ? model.replace(/\[1m\]$/i, "") : model;
  if (typeof localStorage !== "undefined") {
    for (const key of ["ccgui-next.activeSession:v1", "ccgui-next.openTabs:v1"]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const value = JSON.parse(raw);
        let changed = false;
        for (const session of Array.isArray(value) ? value : [value]) {
          if (!session || typeof session.engine !== "string") continue;
          const model = strip(session.engine, session.model);
          if (model !== session.model) { session.model = model; changed = true; }
        }
        if (changed) localStorage.setItem(key, JSON.stringify(value));
      } catch { /* Leave malformed persisted sessions to the host's recovery path. */ }
    }
  }
  try {
    const settings = (await invokeHost("get_app_settings")) as {
      defaultModels?: Record<string, string>;
      defaultEfforts?: Record<string, string>;
    } | null;
    if (!settings) return;
    let changed = false;
    const defaultModels = { ...(settings.defaultModels || {}) };
    for (const [engine, model] of Object.entries(defaultModels)) {
      const clean = strip(engine, model) as string;
      if (clean !== model) { defaultModels[engine] = clean; changed = true; }
    }
    if (changed) {
      const nextSettings: Record<string, unknown> = { ...settings, defaultModels };
      await invokeHost("update_app_settings", { settings: nextSettings });
    }
  } catch { /* ignore host errors */ }
}

/** Mounted tabs may still hold the old selector after storage has been repaired. */
export function repairLegacyHostModel(anchor?: HTMLElement | null): void {
  const host = getHostCliMenuProps(anchor);
  if (!host?.onModelChange || host.streaming) return;
  const session = host.session !== undefined ? host.session : getHostSession();
  const engine = session?.engine || host.value;
  if (!engine || engine === "claude" || (host.value && host.value !== engine)) return;
  const model = session?.model || host.lastUsedModel || host.models?.[engine];
  if (model && /\[1m\]$/i.test(model)) {
    host.onModelChange(engine, model.replace(/\[1m\]$/i, ""));
  }
}

/**
 * 同步更新本地存储中 activeSession 与 openTabs 的会话渠道。
 *
 * 仅对待建会话（sessionId 为空）生效：宿主只在新会话时读页签上的 provider
 * （use-tab-model-display.ts 的 `active.sessionId === null ? active.provider : undefined`），
 * 已有会话的渠道以宿主 store 的 bySession[...].activeProvider 为准，宿主自己
 * 切渠道时还会把页签的 provider 清空。此时插件再写这个字段既不会被读取，
 * 又会在回读时伪造出一条会话级绑定，反而盖掉宿主的真实选择。
 */
export function syncSessionProviderToLocalStorage(engine: string, providerId: string): void {
  if (typeof localStorage === "undefined") return;

  const ACTIVE_KEY = "ccgui-next.activeSession:v1";
  const TABS_KEY = "ccgui-next.openTabs:v1";

  // 以宿主 props 的活动会话为准：localStorage 的 activeSession 可能是别的页签延迟
  // 写入的记录，engine 相同也不代表就是当前会话，按它打补丁会污染那个页签的渠道
  const hostProps = getHostCliMenuProps();
  const active = hostProps?.session !== undefined ? hostProps.session : getHostSession();
  if (!active || active.engine !== engine) return;
  // 旧宿主靠 active.provider 认会话级渠道，任何会话都要写。新宿主自己用
  // bySession[engine/sessionId].activeProvider 管绑定，切换时还会把 provider 清成
  // undefined；给已建会话补这个字段等于伪造一份它根本不读的绑定，只会被 readSessionDisplay
  // 当成陈旧值回读。待建会话（sessionId 为空）例外：首次 spawn 要靠它选对渠道。
  if (isNewHost() && (active.sessionId ?? null) !== null) return;
  const isActiveSession = (tab: unknown): boolean => {
    if (!tab || typeof tab !== "object") return false;
    const record = tab as { engine?: string; sessionId?: string | null; workspacePath?: string };
    return record.engine === engine
      && (record.sessionId ?? null) === (active.sessionId ?? null)
      && (record.workspacePath ?? "") === (active.workspacePath ?? "");
  };

  try {
    const activeRaw = localStorage.getItem(ACTIVE_KEY);
    if (activeRaw) {
      const stored = JSON.parse(activeRaw);
      if (isActiveSession(stored)) {
        stored.provider = providerId || undefined;
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(stored));
      }
    }

    const tabsRaw = localStorage.getItem(TABS_KEY);
    if (tabsRaw) {
      const tabs = JSON.parse(tabsRaw);
      if (Array.isArray(tabs)) {
        for (const tab of tabs) {
          if (isActiveSession(tab)) tab.provider = providerId || undefined;
        }
        localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
      }
    }
  } catch (err) {
    console.warn("[model-switcher] 同步会话渠道到 localStorage 失败:", err);
  }
}

/**
 * 将渠道选择应用到宿主：
 * 1. 优先调用宿主 CliMenu 的 onChannelChange，由宿主执行会话级绑定（rememberSessionProvider / patchSession）；
 * 2. 同步更新本地 storage 的 openTabs / activeSession 中的 provider 字段；
 * 3. 所有会话（包括空白新会话）均不改写全局默认渠道；
 * 4. 派发 ccgui:channel-changed 事件通知 UI 响应。
 */
export async function applyChannelSelectionToHost(params: {
  engine: CliEngineId;
  providerId: string;
}): Promise<void> {
  const { engine, providerId } = params;
  const channelError = independentChannelError(engine);
  if (channelError && providerId && ![NATIVE_PROVIDER_ID, "__local_config_toml__"].includes(providerId)) throw new Error(channelError);
  const error = hostSessionSelectionError(engine);
  if (error) throw new Error(error);
  const callbacks = getHostCliMenuProps();
  if (!callbacks) {
    throw new Error("无法连接宿主渠道切换入口，请重载插件后重试");
  }
  // omp / pi 的原生渠道来自 models.yml / agent.db，宿主 config.json 默认未登记；
  // set_current_provider 会严格校验 providers 列表并报错 "provider {id} not found"。
  // 切换前先确保该渠道在宿主完成轻量占位登记，避免报 provider不存在。
  if ((engine === "omp" || engine === "pi") && providerId && providerId !== NATIVE_PROVIDER_ID && providerId !== "__local_config_toml__") {
    await invokeHost("upsert_provider", {
      engine,
      id: providerId,
      json: { name: providerId },
    }).catch(() => {});
  }
  if (callbacks.onChannelChange) {
    // 渠道切换不改派引擎，任何会话字段变化都要中止轮询
    const guardSession = captureHostSessionGuard(engine);
    await callbacks.onChannelChange(engine, providerId);

    // The host wraps its asynchronous setProvider in a void callback and catches
    // backend failures internally. Only its committed selection acknowledges success.
    const deadline = Date.now() + 5000;
    while (true) {
      guardSession();
      const current = getHostCliMenuProps();
      const selectionError = hostSessionSelectionError(engine);
      if (selectionError) throw new Error(selectionError);
      const confirmedProvider = current?.selectedChannels?.[engine] ?? current?.session?.provider;
      if (confirmedProvider === providerId) break;
      if (Date.now() >= deadline) {
        throw new Error("宿主未确认渠道切换，请检查渠道配置或宿主错误提示后重试");
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } else {
    // 无 onChannelChange 的宿主：渠道通过 set_current_provider 原生命令切换。
    // 宿主接受的 ID 是 __local_settings_json__ / __disabled__ / 实际存在的渠道 ID；
    // __local_config_toml__ 是 v1 配置导入留下的遗留拼写（config.rs 的
    // LEGACY_LOCAL_CONFIG_TOML_ID），与 __local_settings_json__ 同义，统一归一成
    // 规范 ID，避免把遗留别名继续写进宿主配置。空串同理表示"用 CLI 自己的配置"。
    // 注意不能映射为 "local"，否则宿主报错 "provider local not found"。
    const targetId = providerId && providerId !== LEGACY_NATIVE_PROVIDER_ID
      ? providerId
      : NATIVE_PROVIDER_ID;
    // 渠道切换不改派引擎，IPC 期间用户切走页签就要中止：set_current_provider 已在
    // 宿主落地无法回滚，但后续的 localStorage 写入和成功事件必须不能落到新页签上，
    // 否则调用方会继续把模型/档位链式写进另一个会话。
    const guardSession = captureHostSessionGuard(engine);
    await invokeHost("set_current_provider", { engine, id: targetId });
    guardSession();
  }

  syncSessionProviderToLocalStorage(engine, providerId);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ccgui:cli-config-changed"));
    window.dispatchEvent(
      new CustomEvent("ccgui:channel-changed", { detail: { engine, providerId } }),
    );
  }
}
