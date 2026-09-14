import { React, useEffect, useMemo, useRef, useState } from "../react-context";
import type { PluginContext } from "../ccgui-plugin";
import { absoluteFilePath, loadFileIndex, searchFiles, type FileIndex } from "../file-search";
import { openHostFile } from "../host-files";
import { SearchIcon, RefreshIcon } from "../icons";

function Highlight({ text, indexes, offset = 0 }: { text: string; indexes: readonly number[]; offset?: number }) {
  const positions = new Set(indexes);
  const segments: { text: string; match: boolean }[] = [];
  for (let index = 0; index < text.length; index++) {
    const match = positions.has(offset + index);
    const previous = segments[segments.length - 1];
    if (previous?.match === match) previous.text += text[index];
    else segments.push({ text: text[index], match });
  }
  return <>{segments.map((segment, index) => segment.match ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>)}</>;
}

export function FileSearchPanel({ ctx, workspacePath }: { ctx: PluginContext; workspacePath: string }) {
  const [query, setQuery] = useState("");
  const [settledQuery, setSettledQuery] = useState("");
  const [index, setIndex] = useState<FileIndex | null>(null);
  const [includeGenerated, setIncludeGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const request = useRef(0);
  const mounted = useRef(true);
  const list = useRef<HTMLDivElement | null>(null);
  const indexing = useRef(false);
  const openPending = useRef(false);
  useEffect(() => () => { mounted.current = false; request.current++; }, []);
  useEffect(() => {
    const timer = setTimeout(() => { setSettledQuery(query); setActive(0); }, 120);
    return () => clearTimeout(timer);
  }, [query]);
  const matches = useMemo(() => query === settledQuery ? searchFiles(index?.files || [], settledQuery) : [], [index, settledQuery, query]);
  useEffect(() => { list.current?.querySelectorAll('button')[active]?.scrollIntoView({ block: "nearest" }); }, [active]);

  const refresh = async (include = includeGenerated) => {
    if (!workspacePath || indexing.current) return;
    indexing.current = true;
    const id = ++request.current;
    setLoading(true); setError(""); setIndex(null); setActive(0);
    try {
      const next = await loadFileIndex(ctx, workspacePath, include);
      if (mounted.current && id === request.current) setIndex(next);
    } catch (e) {
      if (mounted.current && id === request.current) setError(e instanceof Error ? e.message : "文件索引失败");
    } finally {
      if (mounted.current && id === request.current) { setLoading(false); indexing.current = false; }
    }
  };
  const open = async (relative: string) => {
    if (!index || openPending.current) return;
    openPending.current = true;
    setOpening(relative); setError("");
    try { await openHostFile(workspacePath, absoluteFilePath(index.root, relative), () => mounted.current); }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "打开文件失败"); }
    finally { openPending.current = false; if (mounted.current) setOpening(null); }
  };
  return <section className="ms-file-search" data-plugin-file-search aria-label="文件搜索">
    <style>{styles}</style>
    <div className="ms-file-toolbar">
      <div className="ms-file-query"><SearchIcon /><input aria-label="搜索文件" placeholder="搜索文件…" value={query}
        disabled={!workspacePath} onFocus={() => { if (!index && !loading) void refresh(); }}
        onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setActive(value => Math.max(0, Math.min(matches.length - 1, value + (event.key === "ArrowDown" ? 1 : -1))));
          } else if (event.key === "Enter" && matches[active]) { event.preventDefault(); void open(matches[active].path); }
          else if (event.key === "Escape") { setQuery(""); setActive(0); }
        }} />
        {query && <button type="button" aria-label="清空搜索" title="清空搜索" onClick={() => setQuery("")}>×</button>}
      </div>
      <button className="ms-file-refresh" type="button" aria-label="刷新文件索引" title="刷新文件索引" disabled={loading || !workspacePath} onClick={() => void refresh()}>
        <RefreshIcon className={loading ? "ms-file-spin" : ""} />
      </button>
    </div>
    <label className="ms-file-options"><input type="checkbox" checked={includeGenerated} disabled={loading} onChange={event => {
      setIncludeGenerated(event.target.checked); void refresh(event.target.checked);
    }} />包含依赖与构建目录</label>
    <div className="ms-file-status" role="status">
      {loading ? "正在索引文件…" : !workspacePath ? "未选择工作区" : index ? `${matches.length} 个结果 · ${index.files.length} 个文件` : "尚未建立索引"}
    </div>
    {error && <div className="ms-file-error" role="alert">{error}</div>}
    {index?.truncated && <div className="ms-file-status">索引达到上限，部分文件未收录</div>}
    {!!index?.unreadable && <div className="ms-file-status">{index.unreadable} 个目录无法读取</div>}
    <div className="ms-file-results" ref={list} aria-label="文件搜索结果" aria-busy={loading}>
      {matches.map((match, position) => {
        const offset = match.path.lastIndexOf('/') + 1;
        return <button type="button" key={match.path} title={match.path} aria-label={`打开 ${match.path}`}
          aria-current={position === active ? "true" : undefined} disabled={!!opening}
          onFocus={() => setActive(position)} onClick={() => void open(match.path)}>
          <span className="ms-file-name"><Highlight text={match.path.slice(offset)} indexes={match.indexes} offset={offset} /></span>
          <span className="ms-file-path"><Highlight text={match.path} indexes={match.indexes} /></span>
          {opening === match.path && <span className="ms-file-status">正在打开…</span>}
        </button>;
      })}
      {!loading && index && !matches.length && <p className="ms-file-status">未找到匹配文件</p>}
    </div>
  </section>;
}

const styles = `
.ms-file-search { display:flex; flex-direction:column; height:100%; min-height:0; min-width:0; color:var(--color-text-primary,#222); background:var(--color-background-primary-default,#fff); font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
.ms-file-toolbar { display:flex; align-items:center; gap:6px; padding:12px 10px 6px; }
.ms-file-query { display:flex; align-items:center; flex:1; min-width:0; gap:6px; padding:6px 8px; border:1px solid var(--color-border-button-default,#ddd); border-radius:6px; background:var(--color-background-secondary-default,#f5f5f5); }
.ms-file-query:focus-within { border-color:var(--color-border-focus-ring,#168); }
.ms-file-query input { width:100%; min-width:0; border:0; outline:none; color:inherit; background:transparent; font:inherit; }
.ms-file-query input:focus-visible { outline:none; box-shadow:none; }
.ms-file-query button,.ms-file-refresh { display:grid; place-items:center; flex-shrink:0; width:26px; height:26px; border:0; border-radius:4px; background:transparent; color:inherit; cursor:pointer; }
.ms-file-search button:hover { background:var(--color-background-primary-hover,#eee); }
.ms-file-search button:focus-visible { outline:2px solid var(--color-border-focus-ring,#168); outline-offset:-2px; }
.ms-file-options { display:flex; align-items:center; gap:6px; margin:4px 10px; color:var(--color-text-secondary,#666); }
.ms-file-status { margin:0; padding:6px 10px; color:var(--color-text-secondary,#666); font-size:11px; }
.ms-file-error { padding:8px 10px; color:var(--color-text-error-primary,#b22); overflow-wrap:anywhere; }
.ms-file-results { flex:1; min-height:0; overflow:auto; padding:2px 6px; }
.ms-file-results > button { display:flex; flex-direction:column; gap:2px; text-align:left; width:100%; min-width:0; min-height:48px; padding:7px 8px; border:0; border-radius:4px; color:inherit; background:transparent; cursor:pointer; }
.ms-file-results > button[aria-current] { background:var(--color-background-primary-active,#e6edef); box-shadow:inset 2px 0 var(--color-border-focus-ring,#168); }
.ms-file-name,.ms-file-path { display:block; width:100%; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.ms-file-path { color:var(--color-text-secondary,#666); font-size:11px; }
.ms-file-results mark { color:var(--color-border-focus-ring,#168); font-weight:600; background:transparent; }
.ms-file-search button:disabled { cursor:default; opacity:.6; }
.ms-file-spin { animation:ms-file-spin 1s linear infinite; }
@keyframes ms-file-spin { to {transform:rotate(360deg)} }
@media(prefers-reduced-motion:reduce) { .ms-file-spin {animation:none} }
`;
