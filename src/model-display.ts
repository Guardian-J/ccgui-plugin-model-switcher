import type { Disposer } from "./ccgui-plugin";

/** Display only: keep the provider-qualified ID in session state and CLI requests. */
export function compactPluginModelLabel(value: string): string {
  return value.replace(/\bplugin_model-switcher_[A-Za-z0-9_-]+\//g, "");
}

// Host MessageMeta, scoped away from Markdown, user messages and tool output.
const metadataSelector = '[data-virtual-inner] .group > .mt-1.flex.items-center.gap-2 > span.text-caption-1-regular.tabular-nums';

export function installCompactModelLabels(): Disposer {
  const changed = new Map<Text, { original: string; display: string }>();
  // Targeted per-parent observers for text nodes we've already modified.
  // These fire only when React reverts our compact label back to the raw form,
  // so the observation scope is tiny vs. watching characterData on document.body.
  const nodeObservers = new Map<Element, MutationObserver>();

  const applyCompact = (text: Text) => {
    const display = compactPluginModelLabel(text.data);
    if (display === text.data) return;
    changed.set(text, { original: text.data, display });
    text.data = display;
  };

  const watchParent = (text: Text) => {
    const parent = text.parentElement;
    if (!parent || nodeObservers.has(parent)) return;
    const obs = new MutationObserver(() => {
      // Re-apply compact label if React reverted the text node.
      if (text.isConnected) {
        const display = compactPluginModelLabel(text.data);
        if (display !== text.data) text.data = display;
      }
    });
    obs.observe(parent, { characterData: true, subtree: true });
    nodeObservers.set(parent, obs);
  };

  const update = (element: Element) => {
    for (const node of element.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const text = node as Text;
      applyCompact(text);
      if (changed.has(text)) watchParent(text);
    }
  };

  const scan = (element: Element) => {
    if (element.matches(metadataSelector)) update(element);
    element.querySelectorAll(metadataSelector).forEach(update);
  };

  // Only watch childList additions — no characterData on the whole body.
  // React text-node reverts are handled by per-parent observers above.
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) scan(node);
      }
    }
    // Release stale references from unmounted virtual rows.
    for (const text of changed.keys()) {
      if (!text.isConnected) changed.delete(text);
    }
    for (const [parent, obs] of nodeObservers) {
      if (!parent.isConnected) { obs.disconnect(); nodeObservers.delete(parent); }
    }
  });

  scan(document.body);
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    for (const obs of nodeObservers.values()) obs.disconnect();
    nodeObservers.clear();
    for (const [text, value] of changed) {
      if (text.data === value.display) text.data = value.original;
    }
    changed.clear();
  };
}
