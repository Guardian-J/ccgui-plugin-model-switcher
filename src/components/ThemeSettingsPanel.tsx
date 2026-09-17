import { React, useState, useEffect } from "../react-context";
import {
  type GuiThemeConfig,
  type GuiThemeManager,
  THEME_PRESETS,
} from "../theme-manager";
import { CheckIcon, ChevronRightIcon } from "../icons";
import { THEME_PALETTES } from "../theme-palette";
import { ThemeCustomizationPanel } from "./ThemeCustomizationPanel";

interface Props {
  manager: GuiThemeManager;
  onClose?: () => void;
}

export function ThemeSettingsPanel({ manager, onClose }: Props) {
  const [config, setConfig] = useState<GuiThemeConfig>(manager.getConfig());
  const [saveError, setSaveError] = useState("");
  const update = async (partial: Partial<GuiThemeConfig>) => {
    setSaveError("");
    try { await manager.updateConfig(partial); }
    catch { setSaveError("主题保存失败，请重试。当前效果仅在本次运行生效。"); }
  };

  useEffect(() => {
    return manager.subscribe((next) => {
      setConfig(next);
    });
  }, [manager]);

  const handlePresetSelect = (presetId: GuiThemeConfig["preset"]) => {
    void update({ preset: presetId, paletteMode: "preset" });
  };

  const handleToggle = (key: keyof GuiThemeConfig) => {
    if (typeof config[key] === "boolean") {
      void update({ [key]: !config[key] });
    }
  };

  const toggles: { key: keyof GuiThemeConfig; label: string }[] = [
    { key: "enableTimelinePolish", label: "时间线精修" },
    { key: "enableTabPolish", label: "页签精修" },
    { key: "enableComposerGlow", label: "全局聚焦光晕" },
    { key: "enableSleekScrollbars", label: "细滚动条" },
    { key: "enableCardPolish", label: "代码块精修" },
    { key: "enableFontSmoothing", label: "字体平滑" },
  ];

  return (
    <div className="ms-theme">
      <div className="ms-theme-heading">
        <h3>全局主题</h3>
        {onClose ? (
          <button
            type="button"
            aria-label="返回模型选择"
            title="返回模型选择"
            onClick={onClose}
            className="ms-icon-button"
          >
            <ChevronRightIcon size={16} className="ms-back-icon" />
          </button>
        ) : null}
      </div>

      {saveError && <div role="alert" className="ms-status">{saveError}</div>}
      <div className="ms-theme-modes ms-palette-mode" role="group" aria-label="主题模式">
        <button type="button" aria-pressed={config.paletteMode === "preset"} onClick={() => void update({ paletteMode: "preset" })}>内置主题</button>
        <button type="button" aria-pressed={config.paletteMode === "custom"} onClick={() => void update({ paletteMode: "custom" })}>调色盘</button>
      </div>
      {config.paletteMode === "custom" ? <ThemeCustomizationPanel config={config} update={update} /> :
      <div className="ms-theme-grid" role="group" aria-label="主题配色">
        {THEME_PRESETS.map((preset) => {
          const isSelected = config.preset === preset.id;
          const palette = preset.id === "default" ? null : THEME_PALETTES[preset.id];
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetSelect(preset.id)}
              className="ms-theme-preset"
              aria-pressed={isSelected}
              title={preset.name}
            >
              <span className="ms-theme-thumbnail" aria-hidden style={{
                "--preview-light": palette?.light.surface || "#ffffff",
                "--preview-dark": palette?.dark.surface || "#202020",
                "--preview-panel-light": palette?.light.panel || "#f3f3f3",
                "--preview-panel-dark": palette?.dark.panel || "#171717",
                "--preview-accent": preset.accent,
                "--preview-ink-light": palette?.light.muted || "#626262",
                "--preview-ink-dark": palette?.dark.muted || "#bbbbbb",
              } as React.CSSProperties}>
                <span className="ms-theme-thumbnail-nav"><i /><i /><i /></span>
                <span className="ms-theme-thumbnail-chat"><i /><i /><i /><i /></span>
              </span>
              <span className="ms-theme-caption">
                <span className="ms-theme-name">{preset.name.split(" (")[0]}</span>
                <span className="ms-theme-choice" aria-hidden>{isSelected ? <CheckIcon size={14} className="ms-check" /> : <span style={{ backgroundColor: preset.accent }} />}</span>
              </span>
            </button>
          );
        })}
      </div>}
      <section className="ms-theme-section" aria-label="幕布">
        <button type="button" role="switch" aria-label="幕布渲染" aria-checked={config.enableBackdropPolish}
          className="ms-theme-toggle" onClick={() => handleToggle("enableBackdropPolish")}>
          <span className="ms-theme-name">幕布渲染</span><span aria-hidden className="ms-switch"><span /></span>
        </button>
        <div className="ms-theme-sliders">
          {([{ key: "backdropOpacity", label: "幕布浓度", min: 20, max: 80, step: 5, unit: "%" },
            { key: "backdropBlur", label: "幕布模糊", min: 0, max: 16, step: 1, unit: "px" }] as const).map(item =>
            <div className="ms-theme-slider" key={item.key}>
              <span>{item.label}<output>{config[item.key]}{item.unit}</output></span>
              <div className="ms-effort-track">
                <div className="ms-effort-fill" style={{ width: `calc(${(config[item.key] - item.min) / (item.max - item.min)} * (100% - 21px) + 21px)` }} />
                <input className="ms-range" type="range" min={item.min} max={item.max} step={item.step}
                  aria-label={item.label} value={config[item.key]} disabled={!config.enableBackdropPolish}
                  onChange={event => void update({ [item.key]: Number(event.target.value) })} />
              </div>
            </div>)}
        </div>
      </section>
      <div className="ms-theme-toggles">
        {toggles.map((item) => {
          const on = Boolean(config[item.key]);
          return (
            <button
              key={item.key}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => handleToggle(item.key)}
              className="ms-theme-toggle"
              aria-label={item.label}
            >
              <span className="ms-theme-name">{item.label}</span>
              <span aria-hidden className="ms-switch">
                <span />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
