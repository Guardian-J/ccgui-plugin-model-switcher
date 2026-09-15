import type { Disposer } from "./ccgui-plugin";

/** Display only: keep the provider-qualified ID in session state and CLI requests. */
export function compactPluginModelLabel(value: string): string {
  return value.replace(/\bplugin_model-switcher_[A-Za-z0-9_-]+\//g, "");
}

// Host MessageMeta, scoped away from Markdown, user messages and tool output.
const metadataSelector = '[data-virtual-inner] .group > .mt-1.flex.items-center.gap-2 > span.text-caption-1-regular.tabular-nums';

export function installCompactModelLabels(): Disposer {
  const changed = new Map<Text, { original: string; display: string }>();
  const update = (element: Element) => {
    for (const node of element.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const text = node as Text;
      const display = compactPluginModelLabel(text.data);
      if (display === text.data) continue;
      changed.set(text, { original: text.data, display });
      // Preserve React's text node so subsequent renders/removals still work.
      text.data = display;
    }
  };
  const scan = (element: Element) => {
    if (element.matches(metadataSelector)) update(element);
    element.querySelectorAll(metadataSelector).forEach(update);
  };
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const element = record.target instanceof Element ? record.target : record.target.parentElement;
      const metadata = element?.closest(metadataSelector);
      if (metadata) update(metadata);
      for (const node of record.addedNodes) {
        if (node instanceof Element) scan(node);
      }
    }
    // Virtualized history rows must not stay retained after unmounting.
    for (const text of changed.keys()) if (!text.isConnected) changed.delete(text);
  });
  scan(document.body);
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  return () => {
    observer.disconnect();
    for (const [text, value] of changed) {
      if (text.data === value.display) text.data = value.original;
    }
    changed.clear();
  };
}
