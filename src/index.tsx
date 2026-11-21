import { createStateStore } from "./state-store";
import { React, useState, useEffect, useRef, initReact } from "./react-context";
import type { PluginContext, Disposer } from "./ccgui-plugin";
import type { PluginState } from "./types";
import { CliModelFlyoutMenu } from "./components/CliModelFlyoutMenu";
import { GuiThemeManager } from "./theme-manager";
import { ProjectEngineIcon, inferModelEngine } from "./icons";
import { CLI_DISPLAY_NAMES, isPluginProviderId, pluginProviderId, prefetchSystemSnapshot, qualifyEngineModel, updatePiFamilyModelEffort } from "./system-bridge";
import { DEFAULT_STATE } from "./constants";
import { useSessionDisplay, withSessionDisplay } from "./session-display";
import { findBuiltinTriggerButton, applyChannelSelectionToHost, applyModelSelectionToHost, disposeDeferredSelections, enforceContextWindowOverrideForPayload, flushDeferredSelectionsFor, getDeferredSelectionFor, normalizeEffort, repairLegacyContextSelections, subscribeDeferredSelections } from "./sync-host";
import { compactPluginModelLabel, installCompactModelLabels } from "./model-display";
import { disposeHostTransport } from "./host-transport";
import { withRemoteStorage } from "./remote-storage";
import { SEND_BLOCKED_TIP, SEND_GUARD_CSS, installComposerSendGuard, isModelRequiredBlocked } from "./send-guard";

/**
 * CC GUI 插件入口：模型与供应商切换助手 (原生样式对齐 + GUI 美化扩展)
 */
export default function activate(ctx: PluginContext): Disposer {
  ctx = withRemoteStorage(ctx);
  initReact(ctx.react);
  void repairLegacyContextSelections().catch(() => {});
  // 尽早启动 list_engines PATH 探测，避免用户点开弹窗才开始扫盘。
  prefetchSystemSnapshot();

  // 窗口聚焦时静默后台探测，感知外部 CLI 升级/安装
  let lastFocusProbe = Date.now();
  const handleWindowFocus = () => {
    const now = Date.now();
    if (now - lastFocusProbe > 5_000) {
      lastFocusProbe = now;
      prefetchSystemSnapshot(stateStore.get().selectedCli, true);
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("focus", handleWindowFocus);
  }

  // 主题样式在插件状态读完后、浏览器空闲时再注入，避免挡住宿主首屏。
  const themeManager = new GuiThemeManager(ctx);
  let alive = true;

  const stateStore = createStateStore({ ...DEFAULT_STATE }, (next) => ctx.storage.set("state", next));

  ctx.storage
    .get<PluginState>("state")
    .then((saved) => {
      if (!alive) return;
      stateStore.hydrate(saved ? { ...DEFAULT_STATE, ...saved } : null);
      if (saved?.enableTheme !== false) void themeManager.init();
    })
    .catch((err) => {
      console.warn("[model-switcher] 读取配置失败:", err);
      if (!alive) return;
      stateStore.hydrate(null);
      void themeManager.init();
    });

  function useCurrentState(): PluginState {
    const [state, setState] = useState(stateStore.get());
    useEffect(() => stateStore.subscribe(() => setState({ ...stateStore.get() })), []);
    return state;
  }

  // 1. Composer 插槽组件：完全复刻主项目 Composer 底部按钮原生样式，并隐藏并替代原有的模型选择按钮
  function ComposerButton() {
    const [open, setOpen] = useState(false);
    const savedState = useCurrentState();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [sendBlockedNotice, setSendBlockedNotice] = useState(false);
    const blockedNoticeTimerRef = useRef<number | null>(null);
    const sessionDisplay = useSessionDisplay(containerRef);
    const state = withSessionDisplay(savedState, sessionDisplay);
    // 生成中刚切的档位/模型：宿主要等本轮结束才接受（否则会改写这一轮的
    // 历史元信息），但输入框按钮要立刻显示新选择。
    const [, setPendingRevision] = useState(0);
    useEffect(() => subscribeDeferredSelections(() => setPendingRevision((n) => n + 1)), []);
    const pending = getDeferredSelectionFor(
      sessionDisplay?.selectedCli,
      sessionDisplay?.sessionId,
      sessionDisplay?.workspacePath,
    );
    const view: PluginState = pending?.effort
      ? { ...state, effort: normalizeEffort(pending.effort) ?? state.effort }
      : state;
    const modelRequiredBlocked = isModelRequiredBlocked(
      sessionDisplay,
      state.selectedModel,
      pending?.model,
    );

    useEffect(() => {
      prefetchSystemSnapshot(state.selectedCli);
    }, [state.selectedCli]);

    // 对话级渠道隔离：切换到新会话时，恢复该会话上次的渠道和模型选择
    const prevStableKey = useRef<string | null>(null);
    useEffect(() => {
      let cancelled = false;
      const stableKey = sessionDisplay?.stableKey;
      if (!stableKey || stableKey === prevStableKey.current) return;
      prevStableKey.current = stableKey;

      // 新开会话首次对话（sessionId 为空）不自动恢复之前会话遗留的模型
      if (!sessionDisplay?.sessionId) return;
      const record = savedState.sessionChannels?.[stableKey];
      const targetEffort = record?.effort || savedState.effort;
      const engine = record?.selectedCli || sessionDisplay.selectedCli;
      const pluginCh = savedState.pluginChannels?.[engine]?.find(c =>
        c.id === record?.activePluginChannelId
        || c.id === record?.selectedProviderId
        || pluginProviderId(c.id) === record?.selectedProviderId
      );
      const isPluginRec = Boolean(pluginCh || record?.activeChannelType === "plugin" || (record?.selectedProviderId && isPluginProviderId(record.selectedProviderId)));
      const rawProviderId = record?.selectedProviderId;
      const providerId = isPluginRec
        ? (pluginCh ? pluginProviderId(pluginCh.id) : (rawProviderId ? pluginProviderId(rawProviderId) : undefined))
        : rawProviderId;
      const model = record?.selectedModel;

      if (!model && !providerId && !targetEffort) return;

      // 后台静默恢复，不阻塞 UI；失败仅记录警告
      void (async () => {
        try {
          if (providerId) {
            await applyChannelSelectionToHost({ engine, providerId, anchor: containerRef.current });
            if (cancelled || prevStableKey.current !== stableKey) return;
          }
          if (model || targetEffort) {
            // 找到该渠道对象用于 qualify（插件渠道需要加前缀）
            const channelRef = pluginCh ? { id: pluginCh.id, isPlugin: true } : (providerId ? { id: providerId, isPlugin: isPluginRec } : null);
            const hostModel = model ? qualifyEngineModel(engine, channelRef, model) : "";
            if (cancelled || prevStableKey.current !== stableKey) return;
            if ((engine === "omp" || engine === "pi") && hostModel && targetEffort) {
              await updatePiFamilyModelEffort(engine, channelRef, hostModel, targetEffort, record?.enable1MContext).catch(() => {});
            }
            await applyModelSelectionToHost({
              engine,
              model: hostModel,
              effort: targetEffort,
              enable1M: (engine === "claude" || engine === "codex" || engine === "omp" || engine === "pi") ? Boolean(record?.enable1MContext) : false,
              ctx,
              anchor: containerRef.current,
            });
          }
        } catch (err) {
          if (cancelled) return;
          // 静默处理渠道不存在等错误，避免干扰用户
          const errMsg = err instanceof Error ? err.message : String(err);
          if (errMsg.includes("not found")) {
            console.warn(`[model-switcher] 会话渠道 ${providerId} 在 ${engine} 中不存在，已跳过恢复`);
          } else {
            console.warn("[model-switcher] 恢复会话渠道失败:", err);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [sessionDisplay?.stableKey, sessionDisplay?.sessionId, savedState, ctx]);

    const engineName = CLI_DISPLAY_NAMES[state.selectedCli] || state.selectedCli;
    const bareModel = state.selectedModel ? compactPluginModelLabel(state.selectedModel.replace(/\[1m\]$/i, "")) : "未选择模型";
    const is1M = (state.selectedCli === "claude" || state.selectedCli === "omp" || state.selectedCli === "pi") && state.enable1MContext;
    const displayModel = is1M ? `${bareModel} [1m]` : bareModel;
    const effortText = view.effort || "high";
    const modelIconEngine =
      inferModelEngine(state.selectedModel) || state.selectedCli;
    // 渠道显示名：插件渠道显示名称，系统渠道固定显示"系统渠道"
    const channelName = state.activeChannelType === "plugin"
      ? (state.activeChannelName ||
          state.pluginChannels?.[state.selectedCli]?.find(c => c.id === state.activePluginChannelId)?.name ||
          state.selectedProviderId ||
          "插件渠道")
      : "系统渠道";

    // 动态隐藏紧邻的原生 cliMenu 按钮，实现无缝替代
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      let hidden: HTMLElement | null = null;
      let previousDisplay = "";
      const hideOriginalTrigger = () => {
        const trigger = findBuiltinTriggerButton(el);
        if (!trigger || trigger === hidden) return;
        if (hidden) hidden.style.display = previousDisplay;
        hidden = trigger;
        previousDisplay = trigger.style.display;
        trigger.style.display = "none";
      };

      hideOriginalTrigger();
      // 在异步及 DOM 重新渲染后持续保持隐藏
      const timer = setTimeout(hideOriginalTrigger, 50);
      return () => {
        clearTimeout(timer);
        if (hidden) hidden.style.display = previousDisplay;
      };
    }, []);

    // 未选择模型时禁止直接发送对话（拦截发送键与发送按钮点击）
    useEffect(() => {
      if (!modelRequiredBlocked) {
        setSendBlockedNotice(false);
        if (blockedNoticeTimerRef.current !== null) {
          window.clearTimeout(blockedNoticeTimerRef.current);
          blockedNoticeTimerRef.current = null;
        }
        return;
      }
      const el = containerRef.current;
      if (!el) return;
      return installComposerSendGuard(el, () => {
        setSendBlockedNotice(true);
        if (blockedNoticeTimerRef.current !== null) {
          window.clearTimeout(blockedNoticeTimerRef.current);
        }
        blockedNoticeTimerRef.current = window.setTimeout(() => {
          blockedNoticeTimerRef.current = null;
          setSendBlockedNotice(false);
        }, 2600);
      });
    }, [modelRequiredBlocked]);

    useEffect(() => {
      return () => {
        if (blockedNoticeTimerRef.current !== null) {
          window.clearTimeout(blockedNoticeTimerRef.current);
          blockedNoticeTimerRef.current = null;
        }
      };
    }, []);

    return (
      <div
        ref={containerRef}
        data-ccgui-plugin-model-switcher="true"
        className="relative inline-flex min-w-0 items-center"
      >
        {sendBlockedNotice && !open && (
          <button
            type="button"
            role="status"
            aria-live="polite"
            data-ccgui-plugin-btn="true"
            className="ms-send-blocked-tip"
            title="点击选择模型"
            onClick={() => {
              setSendBlockedNotice(false);
              setOpen(true);
            }}
          >
            {SEND_BLOCKED_TIP}
          </button>
        )}
        <button
          ref={buttonRef}
          type="button"
          data-ccgui-plugin-btn="true"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setSendBlockedNotice(false);
            setOpen((prev) => !prev);
          }}
          title={`引擎: ${state.selectedCli}\n渠道: ${channelName}\n模型: ${state.selectedModel || '未选择'}\n推理强度: ${effortText}`}
          className={`group flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 outline-none transition-colors hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring${sendBlockedNotice ? " ms-model-btn-attention" : ""}`}
        >
          {/* 1. CLI 引擎 Logo */}
          <ProjectEngineIcon engine={state.selectedCli} size={16} />
          <span className="flex min-w-0 items-center gap-1 text-body-2-medium whitespace-nowrap text-text-secondary transition-colors duration-150 ease group-hover:text-text-primary">
            <span className="shrink-0 max-md:hidden">{engineName}</span>
            <span aria-hidden className="shrink-0 text-text-tertiary max-md:hidden">
              /
            </span>
            {/* 2. 模型品牌 Logo */}
            <ProjectEngineIcon engine={modelIconEngine} size={14} />
            <span className="max-w-44 truncate max-md:max-w-28">{displayModel}</span>
            <span aria-hidden className="shrink-0 text-text-tertiary max-md:hidden">
              ·
            </span>
            <span className="shrink-0 font-normal max-md:hidden">{effortText}</span>
          </span>
        </button>

        {open && (
          <CliModelFlyoutMenu
            key={sessionDisplay?.sessionKey || "no-session"}
            ctx={ctx}
            state={view}
            themeManager={themeManager}
            triggerRef={buttonRef}
            onSave={stateStore.save}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    );
  }

  const disposers: Disposer[] = [
    disposeHostTransport,
    disposeDeferredSelections,
    // 生成中切换的模型/档位延后到本轮结束落地。`usage://done`（SDK 0.3.8 起，
    // 引擎 done 事件透传）不依赖 Fiber 找 store，是权威的回合结束信号。
    ctx.events.on("usage://done", (payload) => {
      flushDeferredSelectionsFor(payload);
      enforceContextWindowOverrideForPayload(payload);
    }),
    ctx.events.on("usage://updated", enforceContextWindowOverrideForPayload),
    ctx.events.on("session://activated", enforceContextWindowOverrideForPayload),
    ctx.events.on("session://selection-changed", enforceContextWindowOverrideForPayload),
    installCompactModelLabels(),
    (() => {
      try {
        return ctx.theme?.injectCss?.(SEND_GUARD_CSS) ?? (() => {});
      } catch (err) {
        console.warn("[model-switcher] 注入发送拦截样式失败:", err);
        return () => {};
      }
    })(),
    // 注册到输入框工具栏 cliMenu 插槽（宿主 SDK 0.3.11 起，registerComposerSlot
    // 与 registerComposerStatusItem 共享同一权限 ui:composer-status；此前
    // registerComposerSlot 误校验不存在的 ui:composer，导致该插槽在 0.3.9~0.3.10
    // 宿主上无法使用，已在宿主侧修复）。
    ctx.ui.registerComposerSlot({
      slot: "cliMenu",
      key: "model-switcher-slot",
      component: ComposerButton,
      order: 1,
    }),
    // 释放主题管理器
    () => {
      alive = false;
      stateStore.dispose();
      themeManager.dispose();
    },
    // 清理窗口聚焦监听
    () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleWindowFocus);
      }
    },
  ];

  return () => {
    disposers.forEach((dispose) => {
      try {
        dispose();
      } catch (e) {
        console.error("[model-switcher] disposer error:", e);
      }
    });
  };
}
