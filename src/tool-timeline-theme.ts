// Match host LogRow structure, excluding ordinary Markdown lists and plugin rows.
const row = "[data-virtual-inner] li:has(> [aria-hidden].pointer-events-none > svg):has(> span.block)";
const label = `${row} > span.block`;
const detail = `${row} > div:has(> button[aria-expanded])`;
const summary = '[data-virtual-inner] button[aria-expanded].flex-col:has(> span.flex)';
const thinking = '[data-virtual-inner] .whitespace-pre-wrap.border-l';
const rail = 'nav:has([data-anchor-id])';
const preview = `${rail} [role="tooltip"]`;

export const toolTimelineCss = `
  ${summary} {
    width: 100%;
    min-width: 0;
    text-align: start;
    border-radius: 6px;
    background-color: var(--ms-timeline-surface, var(--color-background-secondary-default));
    box-shadow: inset 2px 0 var(--ms-timeline-accent, var(--color-accent-500)), inset 0 0 0 1px var(--color-separator-border);
  }
  ${summary} > span.flex { padding: 6px 10px; min-width: 0; flex-wrap: wrap; }
  ${summary}:focus-visible {
    outline: 2px solid var(--color-border-focus-ring, #2684ff);
    outline-offset: 2px;
  }
  ${thinking} {
    border-inline-start-color: var(--ms-timeline-accent, var(--color-accent-500));
    background-color: var(--ms-timeline-surface, var(--color-background-secondary-default));
    color: var(--color-text-secondary);
    border-radius: 0 6px 6px 0;
    padding-block: 8px;
    padding-inline-start: 16px;
    padding-inline-end: 10px;
    overflow-wrap: anywhere;
  }
  ${rail} [data-anchor-id] > span {
    background-color: var(--ms-timeline-guide, var(--color-separator-border-strong));
  }
  ${rail} [data-anchor-id][aria-current="location"] > span,
  ${rail} [data-anchor-id]:is(:hover, :focus-visible) > span {
    background-color: var(--ms-timeline-accent, var(--color-accent-500));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ms-timeline-accent, var(--color-accent-500)) 16%, transparent);
  }
  ${row} {
    padding-inline-start: 24px;
    padding-inline-end: 2px;
    padding-bottom: 8px;
    min-width: 0;
  }
  ${row} > .pointer-events-none {
    color: var(--ms-timeline-guide, var(--color-separator-border));
    left: 4px;
  }
  ${row} > .pointer-events-none > svg { top: 4px; }
  ${label} {
    position: relative;
    display: block;
    min-width: 0;
    padding: 7px 10px;
    border-radius: 6px;
    background-color: var(--ms-timeline-surface, var(--color-background-secondary-default));
    box-shadow: inset 3px 0 var(--ms-timeline-accent, var(--color-accent-500)), inset 0 0 0 1px var(--color-separator-border), 0 3px 10px #00000008;
    background-image: linear-gradient(110deg, color-mix(in srgb, var(--ms-timeline-accent, var(--color-accent-500)) 9%, transparent), transparent 65%);
    color: var(--color-text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 22px;
    overflow-wrap: anywhere;
    word-break: normal;
    transition: background-color 180ms ease, box-shadow 180ms ease;
  }
  ${row}:is(:hover, :focus-within) > span.block {
    background-color: var(--color-background-primary-default);
    box-shadow: inset 3px 0 var(--ms-timeline-accent, var(--color-accent-500)), inset 0 0 0 1px var(--ms-timeline-guide, var(--color-separator-border)), 0 3px 14px color-mix(in srgb, var(--ms-timeline-accent, var(--color-accent-500)) 14%, transparent);
  }
  ${row}:is(:hover, :focus-within) > .pointer-events-none {
    color: var(--ms-timeline-accent, var(--color-accent-500));
    filter: drop-shadow(0 0 3px color-mix(in srgb, var(--ms-timeline-accent, var(--color-accent-500)) 35%, transparent));
  }
  ${label} > span.inline-flex {
    max-width: 100%;
    margin-inline-start: 6px;
    border-color: color-mix(in srgb, var(--ms-timeline-accent, var(--color-accent-500)) 18%, var(--color-separator-border));
    border-radius: 4px;
    background-color: color-mix(in srgb, var(--ms-timeline-accent, var(--color-accent-500)) 7%, var(--color-background-primary-default));
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    vertical-align: baseline;
    transform: none;
  }
  ${label} > span.inline-flex > .truncate { color: var(--color-text-secondary); font-size: 11px; }
  ${detail} { margin: 0; padding: 4px 2px 0; min-width: 0; }
  ${detail} > button[aria-expanded] {
    min-height: 24px;
    padding: 2px 6px;
    gap: 4px;
    font-size: 11px;
    line-height: 18px;
    color: var(--color-text-secondary);
  }
  ${detail} > button[aria-expanded="true"] {
    background-color: var(--ms-timeline-surface, var(--color-background-secondary-default));
  }
  ${detail} > .border {
    --color-border-secondary: var(--color-separator-border);
    margin-top: 6px;
    border-color: var(--color-separator-border);
    border-radius: 6px;
    background-color: var(--color-background-primary-default);
    min-width: 0;
    box-shadow: inset 0 2px color-mix(in srgb, var(--ms-timeline-accent, var(--color-accent-500)) 35%, transparent);
  }
  ${detail} pre {
    max-width: 100%;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: normal;
    tab-size: 2;
    font-size: 12px;
    line-height: 1.65;
  }
  ${detail} .flex > pre { min-width: 0; }
  @media (prefers-reduced-motion: reduce) {
    ${label} { transition: none; }
  }
`;

export const toolTimelineGlassCss = `
  ${summary}, ${thinking}, ${preview} {
    background-color: var(--color-background-primary-default, #fff);
    background-image: var(--ms-glass-highlight);
    box-shadow: inset 0 1px var(--ms-glass-edge), inset 0 0 0 1px var(--ms-glass-border), var(--ms-glass-shadow);
  }
  ${preview} { border-color: var(--ms-glass-border); border-radius: 8px; }
  ${label}, ${detail} > .border {
    background-color: var(--color-background-primary-default, #fff);
    background-image: var(--ms-glass-highlight);
    box-shadow: inset 0 1px var(--ms-glass-edge), inset 0 0 0 1px var(--ms-glass-border), var(--ms-glass-shadow);
  }
  ${label} {
    box-shadow: inset 3px 0 var(--ms-timeline-accent, var(--color-accent-500)),
      inset 0 1px var(--ms-glass-edge), inset 0 0 0 1px var(--ms-glass-border), var(--ms-glass-shadow);
  }
  ${row}:is(:hover, :focus-within) > span.block {
    background-color: var(--color-background-primary-default, #fff);
    box-shadow: inset 3px 0 var(--ms-timeline-accent, var(--color-accent-500)),
      inset 0 1px var(--ms-glass-edge), inset 0 0 0 1px var(--ms-timeline-guide, var(--color-separator-border)), var(--ms-glass-shadow);
  }
  ${detail} > button[aria-expanded]:focus-visible {
    outline: 2px solid var(--color-border-focus-ring, #2684ff);
    outline-offset: 2px;
  }
  ${detail} > .border {
    border-color: var(--ms-glass-border);
    border-radius: 8px;
  }
  ${detail} > .border > .border-t {
    border-color: var(--ms-glass-border);
    background-color: color-mix(in srgb, var(--color-background-secondary-default, #eee) 65%, transparent);
  }
  ${label} > span.inline-flex {
    background-color: color-mix(in srgb, var(--color-background-primary-default, #fff) 88%, transparent);
    box-shadow: inset 0 1px var(--ms-glass-edge);
  }
  @supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    ${label}, ${detail} > .border, ${summary}, ${thinking}, ${preview} {
      background-color: var(--ms-glass-surface);
      backdrop-filter: blur(12px) saturate(115%);
      -webkit-backdrop-filter: blur(12px) saturate(115%);
    }
    ${row}:is(:hover, :focus-within) > span.block { background-color: var(--ms-glass-raised); }
  }
  @media (prefers-reduced-transparency: reduce) {
    ${label}, ${row}:is(:hover, :focus-within) > span.block, ${detail} > .border, ${summary}, ${thinking}, ${preview} {
      background-color: var(--color-background-primary-default, #fff);
      background-image: none;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }
  @media (forced-colors: active) {
    ${label}, ${detail} > .border, ${summary}, ${thinking}, ${preview} {
      outline: 1px solid CanvasText;
      outline-offset: -1px;
      background: Canvas;
      box-shadow: none;
      backdrop-filter: none;
    }
  }
`;
