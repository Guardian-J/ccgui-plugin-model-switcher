import { isConcreteModel } from "./selection-policy";
import { committedFiber } from "./sync-host";
import type { SessionDisplay } from "./session-display";

export type ComposerSendShortcut = "enter" | "cmdEnter";

export interface ComposerFiberState {
  sendShortcut: ComposerSendShortcut;
  streaming: boolean;
  pickerOpen: boolean;
  hostDisabled: boolean;
  hostDisabledReason: string | null;
}

export interface ComposerElements {
  composerRoot: HTMLElement;
  toolbar: HTMLElement;
  editableEl: HTMLElement | null;
  sendButton: HTMLElement | null;
  isStreaming: boolean;
}

export const SEND_BLOCKED_TIP = "请先选择模型后再发送";

export const SEND_GUARD_CSS = `
[data-ccgui-model-unselected="true"] [data-ccgui-send-blocked="true"] {
  opacity: 0.5 !important;
  cursor: not-allowed !important;
}
[data-ccgui-model-unselected="true"] [data-ccgui-send-blocked="true"]:hover {
  opacity: 0.5 !important;
}
.ms-send-blocked-tip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 99998;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, #e09f3e 45%, var(--color-border-button-default, #e1e4e8));
  background: var(--color-background-primary-default, #ffffff);
  color: var(--color-text-primary, #20242b);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  box-shadow: 0 6px 20px -4px #00000028, 0 2px 6px #00000010;
  cursor: pointer;
  animation: ms-tip-in 140ms ease-out;
}
.dark .ms-send-blocked-tip {
  background: var(--color-background-primary-default, #202124);
  color: var(--color-text-primary, #f0f1f3);
  border-color: color-mix(in srgb, #e09f3e 55%, var(--color-border-button-default, #383c42));
}
.ms-send-blocked-tip::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #e09f3e;
  flex-shrink: 0;
}
.ms-model-btn-attention {
  box-shadow: 0 0 0 2px color-mix(in srgb, #e09f3e 55%, transparent);
  background: color-mix(in srgb, #e09f3e 12%, transparent);
}
@keyframes ms-tip-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

export function isModelRequiredBlocked(
  sessionDisplay: SessionDisplay | null,
  selectedModel: string | undefined,
  deferredModel?: string,
): boolean {
  if (!sessionDisplay) return false;
  const effectiveModel = (deferredModel !== undefined ? deferredModel : selectedModel) || "";
  return !isConcreteModel(effectiveModel);
}

export function isSendKeyEvent(
  event: Pick<KeyboardEvent, "key" | "shiftKey" | "metaKey" | "ctrlKey" | "isComposing" | "keyCode">,
  sendShortcut: ComposerSendShortcut,
): boolean {
  if (event.isComposing || event.keyCode === 229) return false;
  if (event.key !== "Enter") return false;
  const meta = event.metaKey || event.ctrlKey;
  return sendShortcut === "cmdEnter" ? meta : !event.shiftKey;
}

function walkFiberProps(
  element: HTMLElement | null,
  maxDepth: number,
  visitor: (props: Record<string, unknown>) => boolean | void,
): void {
  if (!element) return;
  let fiber = committedFiber(element);
  for (let depth = 0; fiber && depth < maxDepth; depth++, fiber = fiber.return) {
    const props = fiber.memoizedProps as Record<string, unknown> | undefined;
    if (props && typeof props === "object") {
      if (visitor(props) === true) return;
    }
  }
}

export function readComposerFiberState(
  composerRoot: HTMLElement | null,
  editableEl: HTMLElement | null,
): ComposerFiberState {
  let sendShortcut: ComposerSendShortcut | undefined;
  let streaming = false;
  let pickerOpen = false;
  let hostDisabled = false;
  let hostDisabledReason: string | null = null;

  walkFiberProps(editableEl, 12, (props) => {
    if (!sendShortcut && (props.sendShortcut === "enter" || props.sendShortcut === "cmdEnter")) {
      sendShortcut = props.sendShortcut;
    }
    if (
      props.mentionOpen === true ||
      props.slashOpen === true ||
      props.botOpen === true ||
      props.promptOpen === true
    ) {
      pickerOpen = true;
    }
    if (typeof props.disabled === "boolean") {
      hostDisabled = hostDisabled || props.disabled;
    }
    if (sendShortcut && pickerOpen) return true;
  });

  walkFiberProps(composerRoot, 16, (props) => {
    const looksLikeComposer =
      typeof props.onSubmit === "function" ||
      typeof props.streaming === "boolean" ||
      props.sendShortcut !== undefined ||
      typeof props.disabledReason === "string";
    if (!looksLikeComposer) return;
    if (!sendShortcut && (props.sendShortcut === "enter" || props.sendShortcut === "cmdEnter")) {
      sendShortcut = props.sendShortcut;
    }
    if (typeof props.streaming === "boolean") {
      streaming = props.streaming;
    }
    if (typeof props.disabled === "boolean") {
      hostDisabled = props.disabled;
    }
    if (typeof props.disabledReason === "string" && props.disabledReason.trim()) {
      hostDisabledReason = props.disabledReason.trim();
    }
    return true;
  });

  if (!pickerOpen && composerRoot) {
    pickerOpen = composerRoot.querySelector('[role="listbox"], [role="menu"]') !== null;
  }

  return {
    sendShortcut: sendShortcut ?? "enter",
    streaming,
    pickerOpen,
    hostDisabled,
    hostDisabledReason,
  };
}

function isStopButton(button: HTMLElement, streamingFromFiber: boolean): boolean {
  if (streamingFromFiber) return true;
  return button.querySelector(".lucide-circle-stop") !== null;
}

function findTrailingToolbarButton(toolbar: HTMLElement): HTMLElement | null {
  const children = Array.from(toolbar.children) as HTMLElement[];
  const spacerIndex = children.findIndex(
    (child) => child.classList.contains("flex-1") && child.hasAttribute("aria-hidden"),
  );

  if (spacerIndex !== -1) {
    for (let i = children.length - 1; i > spacerIndex; i--) {
      const child = children[i];
      if (child.tagName === "BUTTON" && !child.hasAttribute("data-ccgui-plugin-btn")) {
        return child;
      }
      const nested = child.querySelector<HTMLElement>("button:not([data-ccgui-plugin-btn])");
      if (nested) return nested;
    }
  }

  const buttons = Array.from(
    toolbar.querySelectorAll<HTMLElement>("button:not([data-ccgui-plugin-btn])"),
  ).filter((btn) => !btn.closest('[data-ccgui-plugin-model-switcher="true"]'));

  return buttons.length > 0 ? buttons[buttons.length - 1] : null;
}

export function findComposerElements(anchor: HTMLElement | null): ComposerElements | null {
  if (!anchor || typeof anchor.closest !== "function") return null;
  const toolbar = anchor.closest<HTMLElement>("div.select-none");
  if (!toolbar) return null;

  let composerRoot: HTMLElement | null = null;
  let current = toolbar.parentElement;
  for (let depth = 0; current && depth < 6; depth++, current = current.parentElement) {
    if (current === document.body || current === document.documentElement) break;
    if (current.querySelector('.composer-editable, [contenteditable="true"]')) {
      composerRoot = current;
      break;
    }
  }
  if (!composerRoot) return null;

  const editableEl = composerRoot.querySelector<HTMLElement>(
    '.composer-editable, [contenteditable="true"]',
  );

  let streamingFromFiber = false;
  walkFiberProps(toolbar, 6, (props) => {
    if (typeof props.streaming === "boolean") {
      streamingFromFiber = props.streaming;
      return true;
    }
  });
  if (!streamingFromFiber) {
    streamingFromFiber = readComposerFiberState(composerRoot, editableEl).streaming;
  }

  const trailingButton = findTrailingToolbarButton(toolbar);
  const isStreaming =
    streamingFromFiber || (trailingButton !== null && isStopButton(trailingButton, false));
  const sendButton = isStreaming ? null : trailingButton;

  return {
    composerRoot,
    toolbar,
    editableEl,
    sendButton,
    isStreaming,
  };
}

export function installComposerSendGuard(
  anchor: HTMLElement,
  onBlockedAttempt: () => void,
): () => void {
  const initial = findComposerElements(anchor);
  if (!initial) return () => {};

  const { composerRoot, toolbar } = initial;
  const savedAttrs = new WeakMap<
    HTMLElement,
    { ariaDisabled: string | null; title: string | null }
  >();
  let markedButton: HTMLElement | null = null;

  const restoreButton = (button: HTMLElement) => {
    const saved = savedAttrs.get(button);
    if (!saved) return;
    button.removeAttribute("data-ccgui-send-blocked");
    if (saved.ariaDisabled === null) {
      button.removeAttribute("aria-disabled");
    } else {
      button.setAttribute("aria-disabled", saved.ariaDisabled);
    }
    if (saved.title === null) {
      button.removeAttribute("title");
    } else {
      button.setAttribute("title", saved.title);
    }
    savedAttrs.delete(button);
  };

  const syncDom = () => {
    const current = findComposerElements(anchor) ?? initial;
    const fiberState = readComposerFiberState(current.composerRoot, current.editableEl);
    current.composerRoot.setAttribute("data-ccgui-model-unselected", "true");

    const nextBtn =
      !current.isStreaming && !fiberState.streaming ? current.sendButton : null;

    if (markedButton && markedButton !== nextBtn) {
      restoreButton(markedButton);
      markedButton = null;
    }

    if (nextBtn) {
      if (!savedAttrs.has(nextBtn)) {
        savedAttrs.set(nextBtn, {
          ariaDisabled: nextBtn.getAttribute("aria-disabled"),
          title: nextBtn.getAttribute("title"),
        });
      }
      nextBtn.setAttribute("data-ccgui-send-blocked", "true");
      nextBtn.setAttribute("aria-disabled", "true");
      if (!fiberState.hostDisabledReason) {
        nextBtn.setAttribute("title", SEND_BLOCKED_TIP);
      }
      markedButton = nextBtn;
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const current = findComposerElements(anchor) ?? initial;
    const editableEl = current.editableEl;
    if (!editableEl || !(event.target instanceof Node) || !editableEl.contains(event.target)) {
      return;
    }
    const fiberState = readComposerFiberState(current.composerRoot, editableEl);
    if (!isSendKeyEvent(event, fiberState.sendShortcut)) return;
    if (fiberState.pickerOpen) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (!fiberState.hostDisabledReason) {
      onBlockedAttempt();
    }
  };

  const handleClick = (event: MouseEvent) => {
    const current = findComposerElements(anchor) ?? initial;
    const fiberState = readComposerFiberState(current.composerRoot, current.editableEl);
    const sendButton =
      !current.isStreaming && !fiberState.streaming ? current.sendButton : null;
    if (!sendButton || !(event.target instanceof Node) || !sendButton.contains(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (!fiberState.hostDisabledReason) {
      onBlockedAttempt();
    }
  };

  syncDom();
  composerRoot.addEventListener("keydown", handleKeyDown, true);
  composerRoot.addEventListener("click", handleClick, true);

  let observer: MutationObserver | null = null;
  if (typeof MutationObserver === "function") {
    observer = new MutationObserver(() => syncDom());
    observer.observe(toolbar, { childList: true, subtree: true });
    observer.observe(composerRoot, { childList: true });
  }

  return () => {
    observer?.disconnect();
    composerRoot.removeEventListener("keydown", handleKeyDown, true);
    composerRoot.removeEventListener("click", handleClick, true);
    composerRoot.removeAttribute("data-ccgui-model-unselected");
    if (markedButton) {
      restoreButton(markedButton);
      markedButton = null;
    }
  };
}
