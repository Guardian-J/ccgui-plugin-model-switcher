import type { CliEngineId, EffortLevel } from "./types";
import { getHostSession, sessionSelectionError, modelSelectionError } from "./selection-policy";
import type { HostSession, ModelCompatibility } from "./selection-policy";
import { invokeHost } from "./host-transport";
import { independentChannelError, NATIVE_PROVIDER_ID } from "./system-bridge";

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
function committedFiber(element: HTMLElement): any {
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
  const toolbar = anchor?.closest("div.select-none");
  if (toolbar) {
    for (const button of toolbar.querySelectorAll<HTMLElement>('button:not([data-ccgui-plugin-btn])')) {
      if (isCliTrigger(button)) return button;
    }
    return null;
  }

  // 1. 通过选择器直接查找紧随在插件按钮前面的同级原生按钮
  const selectorCandidates = [
    'div.select-none > button.group:not([data-ccgui-plugin-btn])[aria-label*=" · "]',
    'div.select-none > button[aria-haspopup="dialog"]:not([data-ccgui-plugin-btn])',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="Claude Code"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="Codex CLI"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="Grok CLI"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="Kimi CLI"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="PI CLI"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="OMP CLI"]',
    'button.group:not([data-ccgui-plugin-btn])[aria-label*="DeepSeek"]',
  ];

  for (const sel of selectorCandidates) {
    const el = document.querySelector<HTMLElement>(sel);
    if (isCliTrigger(el)) return el;
  }

  // Wrapped/mobile toolbars do not keep the native button as a direct sibling.
  const pluginRoot = document.querySelector('[data-ccgui-plugin-model-switcher="true"]');
  const scope = pluginRoot?.closest("div.select-none");
  for (const button of scope?.querySelectorAll<HTMLElement>('button:not([data-ccgui-plugin-btn])') || []) {
    if (isCliTrigger(button)) return button;
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

function isHostStoreActions(value: unknown): value is HostStoreActions {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.setEffort === "function" && typeof rec.setModel === "function" && typeof rec.pinModels === "function";
}

function scanFiberHooks(fiber: { memoizedState?: unknown }): HostStoreActions | null {
  let hook = fiber.memoizedState as { memoizedState?: unknown; next?: unknown } | null;
  for (let n = 0; hook && n < 80; n++, hook = (hook.next ?? null) as typeof hook) {
    if (!hook || typeof hook !== "object") break;
    const value = hook.memoizedState;
    if (isHostStoreActions(value)) return value;
    if (value && typeof value === "object" && isHostStoreActions((value as { current?: unknown }).current)) {
      return (value as { current: HostStoreActions }).current;
    }
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

/**
 * 从隐藏的原生 CliMenu 向上找到 ChatConversation 的 zustand actions。
 * Fiber 上的 onEffortChange 只保证触发 UI 回调；已有会话发请求读的是 setEffort 写入的 activeEffort。
 */
function findHostStoreActions(anchor?: HTMLElement | null): HostStoreActions | null {
  const starts: Array<HTMLElement | null> = [
    findBuiltinTriggerButton(anchor),
    anchor ?? null,
    typeof document === "undefined" ? null : document.querySelector('[data-ccgui-plugin-model-switcher="true"]'),
  ];
  for (const el of starts) {
    if (!el) continue;
    const found = findHostStoreActionsFromFiber(committedFiber(el));
    if (found) return found;
  }
  return null;
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
    // [1m] is a Claude selector, not part of an OMP/PI (or other CLI) model ID.
    if (engine === "claude" && enable1M) {
      finalModel = `${finalModel}[1m]`;
    }
  }

  const callbacks = getHostCliMenuProps();
  const actions = findHostStoreActions();
  const active = callbacks?.session !== undefined ? callbacks.session : getHostSession();

  // 1. 先同步 localStorage，确保数据就绪
  if (effort) syncLocalStorage(engine, finalModel, effort);
  else syncLocalStorage(engine, finalModel, active?.effort || "");

  // 2. 优先调用宿主 zustand setEffort：已有会话会同步写入 bySession.activeEffort
  //    Fiber 上的 onEffortChange 只是 UI 回调，发请求并不读 tab.effort
  try {
    if (actions?.setActiveEngine) {
      actions.setActiveEngine(engine);
    } else if (callbacks?.onChange) {
      callbacks.onChange(engine);
    }
    if (callbacks?.value !== engine && active && active.engine !== engine) {
      throw new Error("当前会话未切换到目标 CLI，请等待当前请求结束后重试");
    }
    if (actions?.setModel) {
      await Promise.resolve(actions.setModel(engine, finalModel));
    } else if (callbacks?.onModelChange) {
      callbacks.onModelChange(engine, finalModel);
    }
    if (effort) {
      if (actions?.setEffort) {
        await Promise.resolve(actions.setEffort(engine, effort));
      } else if (callbacks?.onEffortChange) {
        callbacks.onEffortChange(engine, effort);
      }
    }
  } catch (err) {
    console.warn("[model-switcher] 触发宿主切换失败:", err);
    throw err;
  }

  if (!actions && !callbacks && active && active.engine !== engine) {
    throw new Error("无法连接宿主 CLI 切换入口，请重载插件后重试");
  }
  // 已有会话发请求读的是内存里的 activeEffort。
  // 禁止再走 remember_session_effort：它会触发 sessions_changed，refreshSessions
  // 可能用旧的 listSessions 结果把刚写入的 max 盖回 high。
  if (effort && !actions?.setEffort && !callbacks?.onEffortChange) {
    throw new Error("无法写入宿主推理强度，请重载插件后重试");
  }

  // 3. 同步写入系统后端 AppSettings（确保新会话与默认配置生效）
  await syncAppSettings(engine, finalModel, effort ?? "");

  // 4. 派发通知事件
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ccgui:model-changed", { detail: { engine, model: finalModel, effort } }));
  }
}

/** Repair selectors written by older plugin versions without changing CLI config. */
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
  const settings = await invokeHost("get_app_settings") as { defaultModels?: Record<string, string> } | null;
  if (!settings?.defaultModels) return;
  let changed = false;
  const defaultModels = { ...settings.defaultModels };
  for (const [engine, model] of Object.entries(defaultModels)) {
    const clean = strip(engine, model) as string;
    if (clean !== model) { defaultModels[engine] = clean; changed = true; }
  }
  if (changed) await invokeHost("update_app_settings", { settings: { ...settings, defaultModels } });
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
 * 同步更新本地存储中的 activeSession 与 openTabs 中的会话渠道
 */
export function syncSessionProviderToLocalStorage(engine: string, providerId: string): void {
  if (typeof localStorage === "undefined") return;

  const ACTIVE_KEY = "ccgui-next.activeSession:v1";
  const TABS_KEY = "ccgui-next.openTabs:v1";

  try {
    const activeRaw = localStorage.getItem(ACTIVE_KEY);
    if (activeRaw) {
      const active = JSON.parse(activeRaw);
      if (active && typeof active === "object" && active.engine === engine) {
        active.provider = providerId || undefined;
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
      }
    }

    const tabsRaw = localStorage.getItem(TABS_KEY);
    if (tabsRaw) {
      const tabs = JSON.parse(tabsRaw);
      if (Array.isArray(tabs)) {
        const active = getHostSession();
        for (const tab of tabs) {
          if (
            active &&
            tab &&
            tab.engine === engine &&
            tab.sessionId === active.sessionId &&
            tab.workspacePath === active.workspacePath
          ) {
            tab.provider = providerId || undefined;
          }
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

  if (callbacks.onChannelChange) {
    const sessionIdentity = (host: HostCliMenuProps | null) => {
      const session = host?.session !== undefined ? host.session : getHostSession();
      return JSON.stringify([session?.engine, session?.sessionId, session?.workspacePath]);
    };
    const originalSession = sessionIdentity(callbacks);
    await callbacks.onChannelChange(engine, providerId);

    // The host wraps its asynchronous setProvider in a void callback and catches
    // backend failures internally. Only its committed selection acknowledges success.
    const deadline = Date.now() + 5000;
    while (true) {
      const current = getHostCliMenuProps();
      if (sessionIdentity(current) !== originalSession) {
        throw new Error("当前会话已变化，已停止后续模型切换，请在目标会话重试");
      }
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
    // 新版 CC GUI（CliMenu 已移除 onChannelChange，渠道通过 set_current_provider 原生命令切换）
    let targetId = providerId;
    if (!targetId || targetId === NATIVE_PROVIDER_ID || targetId === "__local_config_toml__") {
      targetId = "local";
    }
    try {
      await invokeHost("set_current_provider", { engine, id: targetId });
    } catch (err) {
      console.warn("[model-switcher] set_current_provider 失败，尝试原 ID:", err);
      if (targetId === "local" && providerId !== "local") {
        try {
          await invokeHost("set_current_provider", { engine, id: providerId || "" });
        } catch {}
      }
    }
  }

  syncSessionProviderToLocalStorage(engine, providerId);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ccgui:cli-config-changed"));
    window.dispatchEvent(
      new CustomEvent("ccgui:channel-changed", { detail: { engine, providerId } }),
    );
  }
}
