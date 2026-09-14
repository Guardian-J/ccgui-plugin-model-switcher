// Inline styles keep the plugin self-contained when the host imports its JS bundle.
export const flyoutStyles = `
.ms-flyout {
  --ms-bg: var(--color-background-primary-default, var(--background-primary-default, #ffffff));
  --ms-surface: var(--color-background-secondary-default, var(--background-secondary-default, #f6f7f8));
  --ms-hover: var(--color-background-primary-hover, #edf0f3);
  --ms-text: var(--color-text-primary, var(--text-primary, #20242b));
  --ms-muted: var(--color-text-secondary, var(--text-secondary, #646c78));
  --ms-border: var(--color-border-button-default, var(--border-button-default, #e1e4e8));
  --ms-accent: var(--color-accent-500, #147d92);
  --ms-tint: color-mix(in srgb, var(--ms-accent) 9%, var(--ms-bg));
  position: absolute; left: 0; inset: auto; z-index: 99999; margin: 0; padding: 0;
  display: flex; flex-direction: column; width: 760px; max-width: calc(100vw - 24px); height: 560px;
  overflow: hidden; border: 1px solid var(--ms-border); border-radius: 8px;
  background: var(--ms-bg); background-color: var(--ms-bg); color: var(--ms-text);
  opacity: 1;
  box-shadow: 0 18px 60px -12px #00000038, 0 2px 8px #0000000d;
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  letter-spacing: 0; text-align: left; outline: none; isolation: isolate; animation: ms-enter 140ms ease-out;
}
.dark .ms-flyout {
  --ms-bg: var(--color-background-primary-default, var(--background-primary-default, #202124));
  --ms-surface: var(--color-background-secondary-default, var(--background-secondary-default, #25272b));
  --ms-hover: var(--color-background-primary-hover, #303338);
  --ms-text: var(--color-text-primary, var(--text-primary, #f0f1f3));
  --ms-muted: var(--color-text-secondary, var(--text-secondary, #a4abb5));
  --ms-border: var(--color-border-button-default, var(--border-button-default, #383c42));
  --ms-accent: var(--color-border-focus-ring, #62c4d4);
}
.ms-flyout *, .ms-flyout *::before, .ms-flyout *::after { box-sizing: border-box; }
.ms-flyout button, .ms-flyout input, .ms-flyout select { font: inherit; letter-spacing: 0; }
.ms-flyout button { color: inherit; cursor: pointer; }
.ms-flyout button:disabled { opacity: .4; cursor: not-allowed; }
.ms-flyout button:focus-visible, .ms-flyout input:focus-visible { outline: 2px solid var(--ms-accent); outline-offset: 2px; }
.ms-flyout svg { flex-shrink: 0; }
.ms-content { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.ms-loading-overlay { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: var(--ms-bg); color: var(--ms-muted); cursor: wait; }
.ms-loading-overlay svg, .ms-loading-caption svg { color: var(--ms-accent); }
.ms-model-loading { display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow: hidden; }
.ms-loading-caption { display: flex; align-items: center; gap: 8px; padding: 8px 10px; color: var(--ms-muted); font-size: 12px; }
.ms-skeleton-row { display: flex; align-items: center; gap: 12px; height: 52px; flex-shrink: 0; padding: 10px; animation: ms-pulse 1.4s ease-in-out infinite; }
.ms-skeleton-row > span { width: 22px; height: 22px; border-radius: 5px; background: var(--ms-hover); }
.ms-skeleton-row > div { display: flex; flex-direction: column; gap: 8px; flex: 1; }
.ms-skeleton-row i { height: 10px; width: 62%; border-radius: 3px; background: var(--ms-hover); }
.ms-skeleton-row i + i { height: 8px; width: 38%; }
@keyframes ms-pulse { 50% { opacity: .35; } }
.ms-flyout h2, .ms-flyout h3 { margin: 0; color: var(--ms-text); }
.ms-flyout h2 { font-size: 15px; font-weight: 650; }
.ms-flyout h3 { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; }
.ms-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 18px; border-bottom: 1px solid var(--ms-border); flex-shrink: 0; }
.ms-header-title { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-width: 0; }
.ms-badge { padding: 2px 7px; border-radius: 4px; font-size: 11px; color: var(--ms-muted); background: var(--ms-surface); }
.ms-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.ms-icon-button { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 30px; height: 30px; padding: 0; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--ms-muted) !important; transition: background 120ms, color 120ms; }
.ms-icon-button:hover:not(:disabled), .ms-icon-button[aria-pressed="true"] { background: var(--ms-hover); color: var(--ms-text) !important; }
.ms-body { display: grid; grid-template-columns: 270px minmax(0, 1fr); min-height: 0; flex: 1; overflow: auto; }
.ms-channels, .ms-models { display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: 14px; gap: 10px; }
.ms-channels { border-right: 1px solid var(--ms-border); background: var(--ms-surface); overflow-y: auto; }
.ms-models { padding: 14px 18px; }
.ms-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 26px; flex-shrink: 0; }
.ms-count { font-size: 11px; font-weight: 500; color: var(--ms-muted); font-variant-numeric: tabular-nums; }
.ms-channel-toolbar { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.ms-segments { display: flex; flex: 1; padding: 3px; border: 1px solid var(--ms-border); border-radius: 6px; background: var(--ms-bg); }
.ms-row { display: flex; align-items: center; gap: 10px; min-width: 0; width: 100%; padding: 10px; border: 1px solid transparent; border-radius: 6px; background: transparent; text-align: left; transition: background 120ms, border-color 120ms; }
.ms-row:hover:not(:disabled) { background: var(--ms-hover); }
.ms-row.is-selected, .ms-channel-row.is-selected { background: var(--ms-tint); border-color: color-mix(in srgb, var(--ms-accent) 30%, var(--ms-border)); }
.ms-segments .ms-row { justify-content: center; padding: 4px 6px; font-size: 12px; white-space: nowrap; }
.ms-segments .ms-row.is-selected { background: var(--ms-hover); border-color: transparent; font-weight: 600; }
.ms-channel-list { display: flex; flex-direction: column; gap: 4px; min-height: 80px; flex: 1; overflow-y: auto; padding: 2px; margin: -2px; }
.ms-channel-row { display: flex; align-items: center; min-width: 0; flex-shrink: 0; border: 1px solid transparent; border-radius: 6px; }
.ms-channel-row > .ms-row { flex: 1; border: 0; }
.ms-row-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 2px; }
.ms-row-title, .ms-row-detail { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ms-row-title { font-size: 13px; font-weight: 550; }
.ms-row-detail { font-size: 11px; color: var(--ms-muted); }
.ms-check { margin-left: auto; color: var(--ms-accent); }
.ms-delete, .ms-view-channel, .ms-edit-channel { width: 26px; height: 28px; margin-right: 3px; opacity: 0; }
.ms-channel-row:hover .ms-delete, .ms-channel-row:focus-within .ms-delete,
.ms-channel-row:hover .ms-view-channel, .ms-channel-row:focus-within .ms-view-channel,
.ms-channel-row:hover .ms-edit-channel, .ms-channel-row:focus-within .ms-edit-channel { opacity: 1; }
.ms-delete:hover { color: #ce4654 !important; }
.ms-channel-form { display: flex; flex-direction: column; gap: 10px; padding: 2px 0 12px; border-bottom: 1px solid var(--ms-border); }
.ms-channel-form label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--ms-muted); }
.ms-field { display: block; min-width: 0; width: 100%; height: 34px; padding: 7px 10px; border: 1px solid var(--ms-border); border-radius: 6px; background: var(--ms-bg); color: var(--ms-text); outline: none; }
.ms-flyout select.ms-field { appearance: auto; }
.ms-field[readonly] { color: var(--ms-muted); cursor: default; }
.ms-secret-field { position: relative; display: block; }
.ms-secret-field .ms-field { padding-right: 36px; }
.ms-secret-toggle { position: absolute; right: 2px; top: 2px; width: 30px; height: 30px; }
.ms-field::placeholder { color: var(--ms-muted); opacity: .8; }
.ms-field:hover { border-color: color-mix(in srgb, var(--ms-muted) 45%, var(--ms-border)); }
.ms-form-actions { display: flex; justify-content: flex-end; gap: 6px; }
.ms-button { display: inline-flex; align-items: center; justify-content: center; min-height: 28px; padding: 4px 10px; border: 1px solid var(--ms-border); border-radius: 5px; background: var(--ms-bg); white-space: nowrap; font-size: 12px !important; }
.ms-button:hover { background: var(--ms-hover); }
.ms-primary { background: var(--ms-text); color: var(--ms-bg) !important; border-color: var(--ms-text); }
.ms-primary:hover { background: color-mix(in srgb, var(--ms-text) 85%, var(--ms-bg)); }
.ms-empty { display: flex; align-items: center; justify-content: center; min-height: 100px; padding: 16px; color: var(--ms-muted); font-size: 12px; text-align: center; }
.ms-scrub { display: flex; flex-direction: column; justify-content: center; gap: 8px; margin-top: auto; min-height: 90px; padding: 12px 2px 0; border-top: 1px solid var(--ms-border); flex-shrink: 0; }
.ms-scrub-heading, .ms-scrub-controls { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ms-scrub-state { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--ms-muted); font-size: 12px; }
.ms-scrub-state::before { content: ''; width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: var(--ms-muted); }
.ms-scrub-state[data-state="clean"]::before { background: #25986c; }
.ms-scrub-state[data-state="unscrubbed"]::before { background: #c48b1d; }
.ms-scrub-message { margin: 0; color: var(--ms-muted); font-size: 11px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 96px; overflow-y: auto; }
.ms-muted { color: var(--ms-muted); font-size: 11px; }
.ms-search { position: relative; flex-shrink: 0; }
.ms-search .ms-field { padding-left: 33px; background: var(--ms-surface); }
.ms-search-icon { position: absolute; left: 11px; top: 10px; color: var(--ms-muted); pointer-events: none; }
.ms-model-list { display: flex; flex-direction: column; gap: 4px; min-height: 80px; flex: 1; overflow-y: auto; padding: 3px; margin: -3px; }
.ms-model-list .ms-row { flex-shrink: 0; min-height: 52px; }
.ms-model-row { display: flex; align-items: center; gap: 4px; flex-shrink: 0; border: 1px solid transparent; border-radius: 6px; }
.ms-model-row.is-selected { background: var(--ms-tint); border-color: color-mix(in srgb, var(--ms-accent) 30%, var(--ms-border)); }
.ms-model-row > .ms-row { flex: 1; border-color: transparent; }
.ms-model-delete { opacity: 0; color: var(--ms-muted) !important; }
.ms-model-row:hover .ms-model-delete, .ms-model-row:focus-within .ms-model-delete { opacity: 1; }
.ms-custom-model { display: flex; align-items: center; gap: 6px; flex-shrink: 0; padding-top: 2px; }
.ms-add-model { width: 34px; height: 34px; background: var(--ms-surface); border-color: var(--ms-border); }
.ms-effort { padding-top: 12px; border-top: 1px solid var(--ms-border); flex-shrink: 0; }
.ms-effort-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ms-effort-label { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.ms-effort-label output { color: var(--ms-text); font-size: 11px; font-weight: 650; }
.ms-switch-button { display: flex; align-items: center; gap: 8px; padding: 3px 6px; border: 0; border-radius: 4px; background: transparent; font-size: 11px !important; cursor: pointer; color: var(--ms-text); user-select: none; }
.ms-switch-button:hover { background: var(--ms-hover); }
.ms-switch { display: inline-flex; align-items: center; width: 30px; height: 18px; flex-shrink: 0; border-radius: 10px; background: color-mix(in srgb, var(--ms-muted) 45%, var(--ms-bg)); transition: background 150ms; pointer-events: none; }
[aria-checked="true"] .ms-switch, .ms-switch-button[aria-checked="true"] .ms-switch { background: var(--ms-accent); }
.ms-switch > span { width: 14px; height: 14px; border-radius: 50%; background: #fff; transform: translateX(2px); box-shadow: 0 1px 3px #0003; transition: transform 150ms; }
[aria-checked="true"] .ms-switch > span, .ms-switch-button[aria-checked="true"] .ms-switch > span { transform: translateX(14px); }
.ms-effort-track { position: relative; width: 100%; height: 27px; border-radius: 8px; background: var(--ms-surface); }
.ms-effort-fill { position: absolute; inset: 0 auto 0 0; border-radius: 8px; background: var(--color-background-tertiary-hover, var(--ms-hover)); transition: width 150ms ease-out; pointer-events: none; }
.ms-effort-ticks { position: absolute; left: 9px; right: 9px; top: 7px; height: 13px; display: flex; justify-content: space-between; pointer-events: none; }
.ms-effort-ticks span { width: 3px; height: 13px; border-radius: 2px; background: var(--color-foreground-icon-tertiary, var(--ms-muted)); transition: opacity 150ms; }
.ms-flyout .ms-range { appearance: none; position: relative; display: block; width: 100%; height: 27px; padding: 0; margin: 0; border: 0; border-radius: 8px; background: transparent; cursor: grab; }
.ms-range:active { cursor: grabbing; }
.ms-range::-webkit-slider-runnable-track { height: 27px; background: transparent; border: 0; }
.ms-range::-webkit-slider-thumb { appearance: none; width: 21px; height: 27px; background: var(--ms-bg); border: 1px solid var(--color-border-checkbox-default, var(--ms-border)); border-radius: 7px; box-shadow: 0 1px 2px #0000000d; }
.ms-range::-moz-range-track { height: 27px; background: transparent; border: 0; }
.ms-range::-moz-range-thumb { box-sizing: border-box; width: 21px; height: 27px; background: var(--ms-bg); border: 1px solid var(--color-border-checkbox-default, var(--ms-border)); border-radius: 7px; }
.ms-range-labels { display: flex; justify-content: space-between; padding: 6px 0 3px; color: var(--ms-muted); font-size: 11px; }
.ms-status { flex-shrink: 0; max-height: 64px; overflow-y: auto; padding: 7px 18px; border-top: 1px solid var(--ms-border); background: var(--ms-tint); color: var(--ms-text); font-size: 12px; overflow-wrap: anywhere; }
.ms-confirm-backdrop { position: absolute; inset: 0; z-index: 8; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--ms-bg); }
.ms-confirm-dialog { position: relative; inset: auto; margin: 0; width: min(360px, 100%); padding: 18px; border: 1px solid var(--ms-border); border-radius: 8px; background: var(--ms-surface); color: var(--ms-text); box-shadow: 0 12px 32px #0003; }
.ms-confirm-dialog h3 { margin: 0 0 8px; font-size: 14px; }
.ms-confirm-dialog p { margin: 0 0 16px; color: var(--ms-muted); font-size: 12px; overflow-wrap: anywhere; }
.ms-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
.ms-danger { background: #c43d4b; border-color: #c43d4b; color: #fff !important; }
.ms-engines { display: flex; align-items: center; flex-shrink: 0; gap: 4px; padding: 10px 12px; border-top: 1px solid var(--ms-border); overflow-x: auto; }
.ms-engines .ms-row { width: auto; flex-shrink: 0; padding: 6px 9px; gap: 6px; font-size: 11px; white-space: nowrap; }
.ms-online { width: 5px; height: 5px; flex-shrink: 0; border-radius: 50%; background: #25a078; }
.ms-theme-scroll { flex: 1; min-height: 0; overflow-y: auto; }
.ms-theme { padding: 16px 18px; }
.ms-theme-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.ms-back-icon { transform: rotate(180deg); }
.ms-theme-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.ms-theme-preset { display: flex; flex-direction: column; gap: 0; padding: 5px; min-width: 0; border: 1px solid var(--ms-border); border-radius: 6px; background: var(--ms-bg); text-align: left; }
.ms-theme-preset[aria-pressed="true"] { border-color: var(--ms-accent); background: var(--ms-tint); }
.ms-theme-preset:hover { background: var(--ms-hover); }
.ms-swatch { width: 20px; height: 20px; flex-shrink: 0; border-radius: 50%; box-shadow: inset 0 0 0 1px #00000012; }
.ms-theme-name { min-width: 0; flex: 1; font-size: 12px; overflow-wrap: anywhere; }
.ms-theme-thumbnail { display: grid; grid-template-columns: 26% 1fr; width: 100%; height: 58px; overflow: hidden; border-radius: 3px; background: var(--preview-light); }
.dark .ms-theme-thumbnail { background: var(--preview-dark); }
.ms-theme-thumbnail-nav { display: flex; flex-direction: column; gap: 5px; padding: 10px 5px; background: var(--preview-panel-light); }
.dark .ms-theme-thumbnail-nav { background: var(--preview-panel-dark); }
.ms-theme-thumbnail i { display: block; height: 3px; border-radius: 1px; background: var(--preview-ink-light); opacity: .25; }
.dark .ms-theme-thumbnail i { background: var(--preview-ink-dark); }
.ms-theme-thumbnail-nav i:first-child { background: var(--preview-accent); opacity: .8; }
.ms-theme-thumbnail-chat { display: flex; flex-direction: column; gap: 5px; padding: 8px 9px; }
.ms-theme-thumbnail-chat i:first-child { width: 48%; height: 9px; align-self: flex-end; background: var(--preview-accent); opacity: 1; border-radius: 2px; }
.ms-theme-thumbnail-chat i:nth-child(3) { width: 72%; }
.ms-theme-thumbnail-chat i:last-child { margin-top: 2px; height: 8px; opacity: .1; }
.ms-theme-caption { display: flex; align-items: center; gap: 4px; width: 100%; min-height: 30px; padding: 5px 3px 0; }
.ms-theme-choice { display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex-shrink: 0; }
.ms-theme-choice > span { width: 8px; height: 8px; border-radius: 2px; }
.ms-theme-section { padding-top: 12px; margin-top: 14px; border-top: 1px solid var(--ms-border); }
.ms-theme-section h4 { margin: 0 0 8px; font-size: 12px; font-weight: 500; }
.ms-theme-section > .ms-theme-toggle { width: 100%; min-height: 32px; padding-top: 0; }
.ms-theme-modes { display: flex; padding: 3px; gap: 3px; background: var(--ms-surface); border: 1px solid var(--ms-border); border-radius: 6px; }
.ms-theme-modes button { flex: 1; min-width: 0; min-height: 30px; border: 0; border-radius: 4px; background: transparent; color: var(--ms-muted); font-size: 12px; }
.ms-theme-modes button[aria-pressed="true"] { background: var(--ms-bg); color: var(--ms-text); box-shadow: 0 1px 3px #00000016; }
.ms-theme-sliders { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 8px; }
.ms-theme-slider { min-width: 0; }
.ms-theme-slider > span { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; color: var(--ms-muted); }
.ms-theme-slider output { font-variant-numeric: tabular-nums; color: var(--ms-text); }
.ms-theme-slider:has(:disabled) { opacity: .45; }
.ms-palette-mode { margin-bottom: 14px; }
.ms-color-field { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 8px; border-bottom: 1px solid var(--ms-border); }
.ms-color-field input[type="color"] { appearance: none; width: 34px; height: 34px; flex-shrink: 0; padding: 0; border: 1px solid var(--ms-border); border-radius: 6px; background: transparent; cursor: pointer; }
.ms-color-field input::-webkit-color-swatch-wrapper { padding: 3px; }
.ms-color-field input::-webkit-color-swatch { border: 0; border-radius: 3px; }
.ms-color-field input::-moz-color-swatch { border: 0; border-radius: 3px; }
.ms-color-field > span { min-width: 0; font-size: 12px; }
.ms-color-field code { display: block; color: var(--ms-muted); font-size: 10px; }
.ms-image-toolbar { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.ms-image-toolbar > .ms-theme-toggle { min-height: 30px; }
.ms-image-import { display: flex; align-items: center; gap: 6px; margin-right: auto; padding: 6px 0; border: 0; background: transparent; font-size: 12px; }
.ms-image-preview { height: 112px; margin-top: 8px; overflow: hidden; border-radius: 6px; background: var(--ms-surface); }
.ms-image-preview img { display: block; width: 100%; height: 100%; }
.ms-image-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; margin: 6px 0 10px; font-size: 11px; color: var(--ms-muted); }
.ms-image-dim { display: block; margin-top: 12px; }
.ms-theme-toggles { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; margin-top: 18px; border-top: 1px solid var(--ms-border); padding-top: 6px; }
.ms-theme-toggle { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-width: 0; min-height: 44px; padding: 8px 0; border: 0; background: transparent; text-align: left; }
.ms-flyout .animate-spin { animation: ms-spin 1s linear infinite; }
@keyframes ms-enter { from { opacity: 0; } to { opacity: 1; } }
@keyframes ms-spin { to { transform: rotate(360deg); } }
@media (max-width: 600px) {
  .ms-flyout { height: 680px; }
  .ms-header { padding: 10px 12px; }
  .ms-header-title { gap: 7px; }
  .ms-header-title > .ms-badge { display: none; }
  .ms-body { display: flex; flex-direction: column; }
  .ms-channels { flex-shrink: 0; border-right: 0; border-bottom: 1px solid var(--ms-border); padding: 12px; overflow: visible; }
  .ms-channel-list { max-height: 128px; flex: auto; }
  .ms-models { flex: 1 0 auto; min-height: 320px; padding: 12px; }
  .ms-model-list { min-height: 120px; max-height: 220px; flex: auto; }
  .ms-delete { opacity: 1; }
  .ms-engines { padding: 8px; flex-wrap: wrap; }
  .ms-engines .ms-row { padding: 5px 7px; }
  .ms-theme-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ms-theme-toggles { grid-template-columns: 1fr; }
}
@media (hover: none) { .ms-delete { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .ms-flyout, .ms-flyout *, .ms-flyout *::before { animation: none !important; transition: none !important; }
}
`;
