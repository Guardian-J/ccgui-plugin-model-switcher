import { LinkifyIt } from "linkify-it";
import type { PluginContext, Disposer } from "./ccgui-plugin";
import browserSource from "../scripts/open-browser.cjs?raw";

const linkify = new LinkifyIt({ fuzzyLink: false, fuzzyEmail: false, fuzzyIP: false });
interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
}

export function httpUrl(value: string): string | null {
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

/** Work on Markdown nodes so React retains ownership and streamed text stays intact. */
export function remarkHttpLinks() {
  return function visit(node: MarkdownNode): void {
    if (!node.children || ['link', 'linkReference', 'html', 'code'].includes(node.type)) return;
    node.children = node.children.flatMap(child => {
      if (!['text', 'inlineCode'].includes(child.type) || !child.value) {
        visit(child);
        return [child];
      }
      const matches = (linkify.match(child.value) ?? []).filter(match => httpUrl(match.url));
      if (!matches.length) return [child];
      const pieces: MarkdownNode[] = [];
      let start = 0;
      for (const match of matches) {
        if (match.index > start) pieces.push({ type: child.type, value: child.value.slice(start, match.index) });
        pieces.push({ type: 'link', url: httpUrl(match.url)!, children: [{ type: child.type, value: match.raw }] });
        start = match.lastIndex;
      }
      if (start < child.value.length) pieces.push({ type: child.type, value: child.value.slice(start) });
      return pieces;
    });
  };
}

export async function openBrowser(ctx: PluginContext, value: string): Promise<void> {
  const url = httpUrl(value);
  if (!url) throw new Error('链接地址无效');
  // 0.3.0+ 移除了 ctx.host，通过 Tauri API 判断环境
  const isWeb = typeof window !== "undefined" && !window.__TAURI_INTERNALS__?.invoke;
  if (isWeb) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const { invokeHost } = await import('./host-transport');
  const result = await invokeHost<{ code: number | null }>('plugin_exec_run', {
    bin: 'node', args: ['-e', browserSource, '--', url], timeoutMs: 15000,
  });
  if (result.code !== 0) throw new Error('无法打开系统浏览器，请检查默认浏览器及插件的 Node 执行权限');
}

export function installChatLinks(ctx: PluginContext): Disposer {
  // 0.3.0+ 移除了 registerMarkdownRenderer 和 ctx.theme，手动注入样式
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .prose-chat a[href]:hover { text-decoration: underline; text-underline-offset: 3px; }
    .prose-chat a[href]:focus-visible { outline: 2px solid var(--color-accent-500, #2684ff); outline-offset: 3px; }
    .ms-browser-error { position: fixed; bottom: 32px; inset-inline: 16px; margin-inline: auto;
      max-width: 520px; z-index: 2147483647; padding: 12px 16px; border-radius: 6px;
      background: var(--color-background-primary-default, #fff); color: var(--color-text-primary, #222);
      border: 1px solid var(--color-separator-border, #999); box-shadow: 0 4px 18px #0002; font-size: 13px; }
  `;
  document.head.appendChild(styleEl);
  const removeCss = () => styleEl.remove();
  let disposed = false;
  let pending = false;
  let notice: HTMLElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function onClick(event: MouseEvent) {
    if (event.button !== 0 && !(event.type === 'auxclick' && event.button === 1)) return;
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor?.closest('.prose-chat, [data-virtual-inner]')) return;
    const url = httpUrl(anchor.getAttribute('href') ?? '');
    if (!url) return;
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;
    pending = true;
    void openBrowser(ctx, url).catch(error => {
      if (disposed) return;
      notice?.remove();
      clearTimeout(timer);
      notice = document.createElement('div');
      notice.className = 'ms-browser-error';
      notice.setAttribute('role', 'alert');
      notice.textContent = error instanceof Error ? error.message : '无法打开系统浏览器';
      document.body.append(notice);
      timer = setTimeout(() => notice?.remove(), 8000);
    }).finally(() => { pending = false; });
  }
  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
  return () => {
    disposed = true;
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('auxclick', onClick, true);
    clearTimeout(timer);
    notice?.remove();
    removeCss();
  };
}
