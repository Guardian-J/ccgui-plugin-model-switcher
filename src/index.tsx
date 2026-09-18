import { React, useState, useEffect, useRef, initReact } from "./react-context";
import type { PluginContext, Disposer } from "./ccgui-plugin";
import type { PluginState } from "./types";
import { CliModelFlyoutMenu } from "./components/CliModelFlyoutMenu";
import { GuiThemeManager } from "./theme-manager";
import { ProjectEngineIcon, inferModelEngine } from "./icons";
import { CLI_DISPLAY_NAMES, prefetchSystemSnapshot, qualifyEngineModel } from "./system-bridge";
import { DEFAULT_STATE } from "./constants";
import { useSessionDisplay, withSessionDisplay } from "./session-display";
import { installChatLinks } from "./chat-links";
import { repairLegacyContextSelections, findBuiltinTriggerButton, applyChannelSelectionToHost, applyModelSelectionToHost } from "./sync-host";
import { compactPluginModelLabel, installCompactModelLabels } from "./model-display";
import { disposeHostTransport } from "./host-transport";
import { withRemoteStorage } from "./remote-storage";

/**
 * CC GUI 插件入口：模型与供应商切换助手 (原生样式对齐 + GUI 美化扩展)
 */
export default function activate(ctx: PluginContext): Disposer {
  ctx = withRemoteStorage(ctx);
  initReact(ctx.react);
  void repairLegacyContextSelections().catch(() => {
    console.warn("[model-switcher] 修复旧版上下文模型选择失败，请重新选择模型");
  });
  // 尽早启动 list_engines PATH 探测，避免用户点开弹窗才开始扫盘。
  prefetchSystemSnapshot();

  // 窗口聚焦时静默后台探测，感知外部 CLI 升级/安装
  let lastFocusProbe = Date.now();
  const handleWindowFocus = () => {
    const now = Date.now();
    if (now - lastFocusProbe > 5_000) {
      lastFocusProbe = now;
      prefetchSystemSnapshot(currentState.selectedCli, true);
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("focus", handleWindowFocus);
  }

  // 初始化 GUI 美化主题管理器
  const themeManager = new GuiThemeManager(ctx);
  void themeManager.init();

  let currentState: PluginState = { ...DEFAULT_STATE };
  const listeners = new Set<() => void>();

  const notify = () => {
    listeners.forEach((fn) => fn());
  };

  ctx.storage
    .get<PluginState>("state")
    .then((saved) => {
      if (saved) {
        currentState = { ...DEFAULT_STATE, ...saved };
        notify();
      }
    })
    .catch((err) => {
      console.warn("[model-switcher] 读取配置失败:", err);
    });

  const saveState = async (nextState: PluginState) => {
    const saved = nextState.selectedCli === "claude" ? nextState : { ...nextState, enable1MContext: false };
    await ctx.storage.set("state", saved);
    currentState = saved;
    notify();
  };

  function useCurrentState(): PluginState {
    const [state, setState] = useState(currentState);
    useEffect(() => {
      const listener = () => setState({ ...currentState });
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }, []);
    return state;
  }

  // 1. Composer 插槽组件：完全复刻主项目 Composer 底部按钮原生样式，并隐藏并替代原有的模型选择按钮
  function ComposerButton() {
    const [open, setOpen] = useState(false);
    const savedState = useCurrentState();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const sessionDisplay = useSessionDisplay(containerRef);
    const state = withSessionDisplay(savedState, sessionDisplay);

    useEffect(() => {
      prefetchSystemSnapshot(state.selectedCli);
    }, [state.selectedCli]);

    // 对话级渠道隔离：切换到新会话时，恢复该会话上次的渠道和模型选择
    const prevStableKey = useRef<string | null>(null);
    useEffect(() => {
      const stableKey = sessionDisplay?.stableKey;
      if (!stableKey || stableKey === prevStableKey.current) return;
      prevStableKey.current = stableKey;

      const record = savedState.sessionChannels?.[stableKey];
      if (!record) return;

      // 后台静默恢复，不阻塞 UI；失败仅记录警告
      const engine = record.selectedCli;
      const providerId = record.selectedProviderId;
      const model = record.selectedModel;
      void (async () => {
        try {
          if (providerId) {
            await applyChannelSelectionToHost({ engine, providerId });
          }
          if (model) {
            // 找到该渠道对象用于 qualify（插件渠道需要加前缀）
            const pluginCh = savedState.pluginChannels?.[engine]?.find(c => c.id === record.activePluginChannelId);
            const channelRef = pluginCh ? { id: pluginCh.id, isPlugin: true } : (providerId ? { id: providerId } : null);
            const hostModel = qualifyEngineModel(engine, channelRef, model);
            await applyModelSelectionToHost({
              engine,
              model: hostModel,
              effort: record.effort,
              enable1M: record.enable1MContext,
            });
          }
        } catch (err) {
          console.warn("[model-switcher] 恢复会话渠道失败:", err);
        }
      })();
    }, [sessionDisplay?.stableKey]);

    const engineName = CLI_DISPLAY_NAMES[state.selectedCli] || state.selectedCli;
    const bareModel = state.selectedModel ? compactPluginModelLabel(state.selectedModel.replace(/\[1m\]$/i, "")) : "未获取模型";
    const displayModel = state.enable1MContext ? `${bareModel} [1m]` : bareModel;
    const effortText = state.effort || "high";
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

    return (
      <div
        ref={containerRef}
        data-ccgui-plugin-model-switcher="true"
        className="relative inline-flex min-w-0 items-center"
      >
        <button
          ref={buttonRef}
          type="button"
          data-ccgui-plugin-btn="true"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          title={`引擎: ${state.selectedCli}\n渠道: ${channelName}\n模型: ${state.selectedModel || '未选择'}\n推理强度: ${effortText}`}
          className="group flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 outline-none transition-colors hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
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
            state={state}
            themeManager={themeManager}
            triggerRef={buttonRef}
            onSave={saveState}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    );
  }

  const disposers: Disposer[] = [
    disposeHostTransport,
    installCompactModelLabels(),
    installChatLinks(ctx),
    // 注册输入框状态行条目：宿主 1.0.4 的 spec/permissions.json 未收录
    // ui:composer（registerComposerSlot 对应的权限），只有 ui:composer-status
    // 通过校验，故挂载点改为状态行而非工具栏插槽。
    ctx.ui.registerComposerStatusItem({
      key: "model-switcher-slot",
      component: ComposerButton,
      order: 1,
    }),
    // 释放主题管理器
    () => {
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
