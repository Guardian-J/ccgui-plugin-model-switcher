import { describe, expect, it, vi } from "vitest";
import type { SessionDisplay } from "./session-display";
import {
  SEND_BLOCKED_TIP,
  installComposerSendGuard,
  isModelRequiredBlocked,
  isSendKeyEvent,
} from "./send-guard";

function makeSessionDisplay(overrides: Partial<SessionDisplay> = {}): SessionDisplay {
  return {
    sessionKey: '["claude",null,"/ws",false]',
    stableKey: '["claude",null,"/ws"]',
    workspacePath: "/ws",
    sessionId: null,
    selectedCli: "claude",
    selectedModel: "",
    effort: "high",
    enable1MContext: false,
    ...overrides,
  };
}

function attachFiberProps(el: HTMLElement, props: Record<string, unknown>) {
  (el as HTMLElement & { __reactFiber$test?: unknown }).__reactFiber$test = {
    memoizedProps: props,
    return: null,
  };
}

function createMockComposer(options: {
  composerProps?: Record<string, unknown>;
  editableProps?: Record<string, unknown>;
  streaming?: boolean;
  onHostSendClick?: () => void;
  onHostKeyDown?: (e: KeyboardEvent) => void;
} = {}) {
  const hostRoot = document.createElement("div");
  const composerRoot = document.createElement("div");
  composerRoot.className = "relative flex w-full flex-col gap-1 rounded-2xl border p-2";

  const editable = document.createElement("div");
  editable.className = "composer-editable";
  editable.setAttribute("contenteditable", "true");

  const toolbar = document.createElement("div");
  toolbar.className = "flex items-center gap-2 select-none";

  const slot = document.createElement("div");
  slot.setAttribute("data-ccgui-plugin-model-switcher", "true");
  const pluginBtn = document.createElement("button");
  pluginBtn.setAttribute("data-ccgui-plugin-btn", "true");
  pluginBtn.textContent = "未选择模型";
  slot.appendChild(pluginBtn);

  const spacer = document.createElement("div");
  spacer.setAttribute("aria-hidden", "true");
  spacer.className = "min-w-0 flex-1";

  const trailingBtn = document.createElement("button");
  trailingBtn.type = "button";
  trailingBtn.setAttribute("aria-label", options.streaming ? "停止" : "发送");
  if (options.streaming) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "lucide lucide-circle-stop");
    trailingBtn.appendChild(svg);
  } else {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "lucide lucide-arrow-up");
    trailingBtn.appendChild(svg);
  }

  toolbar.append(slot, spacer, trailingBtn);
  composerRoot.append(editable, toolbar);
  hostRoot.appendChild(composerRoot);

  if (options.composerProps) {
    attachFiberProps(composerRoot, options.composerProps);
  }
  if (options.editableProps) {
    attachFiberProps(editable, options.editableProps);
  }

  if (options.onHostSendClick) {
    trailingBtn.addEventListener("click", options.onHostSendClick);
  }
  if (options.onHostKeyDown) {
    editable.addEventListener("keydown", options.onHostKeyDown);
  }

  return {
    hostRoot,
    composerRoot,
    editable,
    toolbar,
    slot,
    pluginBtn,
    trailingBtn,
  };
}

describe("isModelRequiredBlocked", () => {
  it("未解析到 sessionDisplay 时不拦截", () => {
    expect(isModelRequiredBlocked(null, "")).toBe(false);
  });

  it("selectedModel 为空或 default 时返回 true", () => {
    const display = makeSessionDisplay();
    expect(isModelRequiredBlocked(display, "")).toBe(true);
    expect(isModelRequiredBlocked(display, "default")).toBe(true);
  });

  it("selectedModel 或 deferredModel 为具体模型时返回 false", () => {
    const display = makeSessionDisplay({ selectedModel: "claude-sonnet-4" });
    expect(isModelRequiredBlocked(display, "claude-sonnet-4")).toBe(false);
    expect(isModelRequiredBlocked(display, "", "claude-opus-4")).toBe(false);
    expect(isModelRequiredBlocked(display, "claude-sonnet-4", "")).toBe(true);
  });
});

describe("isSendKeyEvent", () => {
  it("enter 模式下拦截 Enter，放行 Shift+Enter 与输入法组合键", () => {
    expect(
      isSendKeyEvent(
        { key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false, isComposing: false, keyCode: 13 },
        "enter",
      ),
    ).toBe(true);
    expect(
      isSendKeyEvent(
        { key: "Enter", shiftKey: true, metaKey: false, ctrlKey: false, isComposing: false, keyCode: 13 },
        "enter",
      ),
    ).toBe(false);
    expect(
      isSendKeyEvent(
        { key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false, isComposing: true, keyCode: 13 },
        "enter",
      ),
    ).toBe(false);
    expect(
      isSendKeyEvent(
        { key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false, isComposing: false, keyCode: 229 },
        "enter",
      ),
    ).toBe(false);
  });

  it("cmdEnter 模式下放行裸 Enter，拦截 Ctrl+Enter / Cmd+Enter", () => {
    expect(
      isSendKeyEvent(
        { key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false, isComposing: false, keyCode: 13 },
        "cmdEnter",
      ),
    ).toBe(false);
    expect(
      isSendKeyEvent(
        { key: "Enter", shiftKey: false, metaKey: true, ctrlKey: false, isComposing: false, keyCode: 13 },
        "cmdEnter",
      ),
    ).toBe(true);
    expect(
      isSendKeyEvent(
        { key: "Enter", shiftKey: false, metaKey: false, ctrlKey: true, isComposing: false, keyCode: 13 },
        "cmdEnter",
      ),
    ).toBe(true);
  });
});

describe("installComposerSendGuard", () => {
  it("未选择模型时拦截 Enter 发送和点击发送按钮，并在清理后恢复", () => {
    const onHostSendClick = vi.fn();
    const onHostKeyDown = vi.fn();
    const onBlockedAttempt = vi.fn();
    const { hostRoot, composerRoot, editable, slot, trailingBtn } = createMockComposer({
      composerProps: { onSubmit: vi.fn(), streaming: false, sendShortcut: "enter" },
      editableProps: { sendShortcut: "enter", mentionOpen: false, slashOpen: false },
      onHostSendClick,
      onHostKeyDown,
    });
    document.body.appendChild(hostRoot);

    try {
      const dispose = installComposerSendGuard(slot, onBlockedAttempt);

      expect(composerRoot.getAttribute("data-ccgui-model-unselected")).toBe("true");
      expect(trailingBtn.getAttribute("data-ccgui-send-blocked")).toBe("true");
      expect(trailingBtn.getAttribute("aria-disabled")).toBe("true");
      expect(trailingBtn.getAttribute("title")).toBe(SEND_BLOCKED_TIP);

      // 按 Enter 被拦截
      const enterEvt = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      editable.dispatchEvent(enterEvt);
      expect(enterEvt.defaultPrevented).toBe(true);
      expect(onHostKeyDown).not.toHaveBeenCalled();
      expect(onBlockedAttempt).toHaveBeenCalledTimes(1);

      // Shift+Enter 换行放行
      const shiftEnterEvt = new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      editable.dispatchEvent(shiftEnterEvt);
      expect(shiftEnterEvt.defaultPrevented).toBe(false);
      expect(onHostKeyDown).toHaveBeenCalledTimes(1);

      // 点击发送按钮被拦截
      const clickEvt = new MouseEvent("click", { bubbles: true, cancelable: true });
      trailingBtn.dispatchEvent(clickEvt);
      expect(clickEvt.defaultPrevented).toBe(true);
      expect(onHostSendClick).not.toHaveBeenCalled();
      expect(onBlockedAttempt).toHaveBeenCalledTimes(2);

      // 选择模型后卸载拦截器，恢复正常状态和发送能力
      dispose();
      expect(composerRoot.hasAttribute("data-ccgui-model-unselected")).toBe(false);
      expect(trailingBtn.hasAttribute("data-ccgui-send-blocked")).toBe(false);
      expect(trailingBtn.hasAttribute("aria-disabled")).toBe(false);
      expect(trailingBtn.hasAttribute("title")).toBe(false);

      const enterAfter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      editable.dispatchEvent(enterAfter);
      expect(enterAfter.defaultPrevented).toBe(false);
      expect(onHostKeyDown).toHaveBeenCalledTimes(2);

      trailingBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expect(onHostSendClick).toHaveBeenCalledTimes(1);
    } finally {
      hostRoot.remove();
    }
  });

  it("自动补全菜单打开时放行 Enter，cmdEnter 模式下放行裸 Enter 并拦截 Ctrl+Enter", () => {
    const onHostKeyDown = vi.fn();
    const onBlockedAttempt = vi.fn();
    const { hostRoot, editable, slot } = createMockComposer({
      composerProps: { onSubmit: vi.fn(), streaming: false, sendShortcut: "cmdEnter" },
      editableProps: { sendShortcut: "cmdEnter", mentionOpen: true },
      onHostKeyDown,
    });
    document.body.appendChild(hostRoot);

    try {
      const dispose = installComposerSendGuard(slot, onBlockedAttempt);

      // 补全菜单打开 + Ctrl+Enter 也应先放行给补全
      editable.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }),
      );
      expect(onHostKeyDown).toHaveBeenCalledTimes(1);
      expect(onBlockedAttempt).not.toHaveBeenCalled();

      // 关闭补全菜单
      attachFiberProps(editable, { sendShortcut: "cmdEnter", mentionOpen: false });

      // cmdEnter 模式下裸 Enter 用于换行，应放行
      editable.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
      expect(onHostKeyDown).toHaveBeenCalledTimes(2);
      expect(onBlockedAttempt).not.toHaveBeenCalled();

      // cmdEnter 模式下 Ctrl+Enter 触发发送，应拦截
      const ctrlEnter = new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      editable.dispatchEvent(ctrlEnter);
      expect(ctrlEnter.defaultPrevented).toBe(true);
      expect(onHostKeyDown).toHaveBeenCalledTimes(2);
      expect(onBlockedAttempt).toHaveBeenCalledTimes(1);

      dispose();
    } finally {
      hostRoot.remove();
    }
  });

  it("流式生成中不标记也不拦截 Stop 按钮，结束后新挂载的发送按钮自动被拦截", async () => {
    const onStopClick = vi.fn();
    const onBlockedAttempt = vi.fn();
    const { hostRoot, composerRoot, toolbar, slot, trailingBtn } = createMockComposer({
      composerProps: { onSubmit: vi.fn(), streaming: true },
      streaming: true,
      onHostSendClick: onStopClick,
    });
    document.body.appendChild(hostRoot);

    try {
      const dispose = installComposerSendGuard(slot, onBlockedAttempt);

      expect(trailingBtn.hasAttribute("data-ccgui-send-blocked")).toBe(false);
      trailingBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expect(onStopClick).toHaveBeenCalledTimes(1);
      expect(onBlockedAttempt).not.toHaveBeenCalled();

      // 模拟宿主结束 streaming，将 Stop 按钮替换为 Send 按钮
      attachFiberProps(composerRoot, { onSubmit: vi.fn(), streaming: false });
      const newSendBtn = document.createElement("button");
      newSendBtn.type = "button";
      const onNewSendClick = vi.fn();
      newSendBtn.addEventListener("click", onNewSendClick);
      toolbar.replaceChild(newSendBtn, trailingBtn);

      await Promise.resolve();

      expect(newSendBtn.getAttribute("data-ccgui-send-blocked")).toBe("true");
      newSendBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expect(onNewSendClick).not.toHaveBeenCalled();
      expect(onBlockedAttempt).toHaveBeenCalledTimes(1);

      dispose();
    } finally {
      hostRoot.remove();
    }
  });

  it("分屏场景下只拦截未选模型的 Composer，不影响另一栏", () => {
    const leftBlocked = vi.fn();
    const leftHostKeyDown = vi.fn();
    const rightHostKeyDown = vi.fn();
    const rightHostSend = vi.fn();

    const left = createMockComposer({
      composerProps: { onSubmit: vi.fn(), streaming: false, sendShortcut: "enter" },
      onHostKeyDown: leftHostKeyDown,
    });
    const right = createMockComposer({
      composerProps: { onSubmit: vi.fn(), streaming: false, sendShortcut: "enter" },
      onHostKeyDown: rightHostKeyDown,
      onHostSendClick: rightHostSend,
    });

    document.body.append(left.hostRoot, right.hostRoot);
    try {
      const disposeLeft = installComposerSendGuard(left.slot, leftBlocked);

      left.editable.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
      expect(leftHostKeyDown).not.toHaveBeenCalled();
      expect(leftBlocked).toHaveBeenCalledTimes(1);

      right.editable.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
      right.trailingBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expect(rightHostKeyDown).toHaveBeenCalledTimes(1);
      expect(rightHostSend).toHaveBeenCalledTimes(1);

      disposeLeft();
    } finally {
      left.hostRoot.remove();
      right.hostRoot.remove();
    }
  });
});
