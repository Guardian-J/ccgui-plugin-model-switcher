import type { PluginContext } from "./ccgui-plugin";
import { paletteCss, THEME_PALETTES } from "./theme-palette";
import { toolTimelineCss, toolTimelineGlassCss } from "./tool-timeline-theme";
import { customThemeColor, paletteFromColor, isBackgroundImage, type CustomPalette } from "./theme-customization";

export interface GuiThemeConfig {
  /** 主题预设 */
  preset: "default" | keyof typeof THEME_PALETTES;
  paletteMode: "preset" | "custom";
  customPalette?: CustomPalette;
  customAccent?: string;
  backgroundImage?: string;
  backgroundName?: string;
  backgroundEnabled: boolean;
  backgroundFit: "cover" | "contain";
  backgroundDim: number;
  /** Legacy texture setting; normalized to plain on load. */
  canvasStyle: "plain" | "grid" | "diagonal";
  enableBackdropPolish: boolean;
  backdropOpacity: number;
  backdropBlur: number;
  enableTimelinePolish: boolean;
  /** 启用亚克力/毛玻璃效果 */
  enableGlassmorphism: boolean;
  /** 全局聚焦光晕，保留旧字段名以兼容已保存的设置 */
  enableComposerGlow: boolean;
  /** 启用极简胶囊滚动条 */
  enableSleekScrollbars: boolean;
  /** 启用代码块与卡片圆角加固 */
  enableCardPolish: boolean;
  /** 启用更精致的平滑字体渲染 */
  enableFontSmoothing: boolean;
  /** 自定义 CSS */
  customCss?: string;
}

export const DEFAULT_THEME_CONFIG: GuiThemeConfig = {
  preset: "acrylic",
  paletteMode: "preset",
  backgroundEnabled: false,
  backgroundFit: "cover",
  backgroundDim: 65,
  canvasStyle: "plain",
  enableBackdropPolish: true,
  backdropOpacity: 45,
  backdropBlur: 6,
  enableTimelinePolish: true,
  enableGlassmorphism: true,
  enableComposerGlow: true,
  enableSleekScrollbars: true,
  enableCardPolish: true,
  enableFontSmoothing: true,
  customCss: "",
};

export interface ThemePresetOption {
  id: GuiThemeConfig["preset"];
  name: string;
  desc: string;
  accent: string;
  badge: string;
}

export const THEME_PRESETS: ThemePresetOption[] = [
  {
    id: "default",
    name: "原生极简 (Classic)",
    desc: "保留 CC GUI 默认配色与标准高对比度设计",
    accent: "#3b82f6",
    badge: "原厂",
  },
  {
    id: "acrylic",
    name: "深空毛玻璃 (Acrylic Glass)",
    desc: "优雅的背景微透毛玻璃虚化与发光边框质感",
    accent: "#6366f1",
    badge: "推荐",
  },
  {
    id: "cyberpunk",
    name: "赛博霓虹 (Cyberpunk)",
    desc: "绚丽的高饱和霓虹色彩渐变与赛博发光轮廓",
    accent: "#ec4899",
    badge: "绚丽",
  },
  {
    id: "nordic",
    name: "北欧极夜 (Nordic Slate)",
    desc: "沉静的极地深冷岩灰与清透冰蓝强调色",
    accent: "#38bdf8",
    badge: "静谧",
  },
  {
    id: "sakura",
    name: "落樱浅绛 (Sakura Mist)",
    desc: "柔和温润的樱粉珊瑚色调与舒适呼吸微光",
    accent: "#f43f5e",
    badge: "温暖",
  },
  {
    id: "emerald",
    name: "翡翠森林 (Emerald Forest)",
    desc: "清新护眼的森林碧玉绿与科技感发光边框",
    accent: "#10b981",
    badge: "护眼",
  },
  { id: "graphite", name: "石墨 (Graphite)", desc: "中性石墨与清透青灰", accent: "#42515e", badge: "新增" },
  { id: "ocean", name: "潮汐 (Ocean)", desc: "冷白底色与深青强调色", accent: "#086c77", badge: "新增" },
  { id: "cobalt", name: "钴蓝 (Cobalt)", desc: "清晰蓝色与中性灰阶", accent: "#2858b9", badge: "新增" },
  { id: "plum", name: "梅影 (Plum)", desc: "柔和梅紫与烟灰色阶", accent: "#854273", badge: "新增" },
  { id: "terminal", name: "青柠终端 (Terminal)", desc: "炭黑与青柠绿色", accent: "#3a672d", badge: "新增" },
  { id: "vermilion", name: "朱砂 (Vermilion)", desc: "素白与克制的朱红", accent: "#b03838", badge: "新增" },
];

export function generateThemeCss(config: GuiThemeConfig): string {
  const parts: string[] = [];
  const palette = config.paletteMode === "custom"
    ? paletteFromColor(customThemeColor(config.customAccent, config.customPalette, config.preset))
    : config.preset === "default" ? undefined : THEME_PALETTES[config.preset];
  if (palette)
    parts.push(
      paletteCss(palette.light, false),
      paletteCss(palette.dark, true),
    );
  if (config.enableGlassmorphism) parts.push(`
    :root {
      --ms-glass-surface: color-mix(in srgb, var(--color-background-primary-default, #fff) 88%, transparent);
      --ms-glass-raised: color-mix(in srgb, var(--color-background-primary-default, #fff) 95%, transparent);
      --ms-glass-edge: #ffffffb8;
      --ms-glass-border: color-mix(in srgb, var(--color-separator-border, #ccd2d8) 78%, transparent);
      --ms-glass-highlight: linear-gradient(135deg, #ffffff24, #ffffff00 52%);
      --ms-glass-shadow: 0 3px 10px #1323310b;
    }
    :root.dark, .dark {
      --ms-glass-surface: color-mix(in srgb, var(--color-background-primary-default, #242629) 92%, transparent);
      --ms-glass-raised: color-mix(in srgb, var(--color-background-primary-default, #242629) 97%, transparent);
      --ms-glass-edge: #ffffff24;
      --ms-glass-border: color-mix(in srgb, var(--color-separator-border, #495057) 88%, #ffffff18);
      --ms-glass-highlight: linear-gradient(135deg, #ffffff09, #ffffff00 52%);
      --ms-glass-shadow: 0 3px 10px #00000026;
    }
  `);
  if (config.enableBackdropPolish) {
    const opacity = Number.isFinite(config.backdropOpacity) ? Math.min(80, Math.max(20, config.backdropOpacity)) : 45;
    const blur = Number.isFinite(config.backdropBlur) ? Math.min(16, Math.max(0, config.backdropBlur)) : 6;
    parts.push(`
      :root { --color-overlay-backdrop: color-mix(in srgb, var(--ms-backdrop-ink, #18202a) ${opacity}%, transparent); }
      .bg-overlay-backdrop { background-color: var(--color-overlay-backdrop); }
      ${config.enableGlassmorphism ? `.bg-overlay-backdrop {
        background-image: linear-gradient(180deg, #ffffff08, #00000014);
        box-shadow: inset 0 1px var(--ms-glass-edge);
      }` : ''}
      @supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
        .bg-overlay-backdrop { backdrop-filter: blur(${blur}px); -webkit-backdrop-filter: blur(${blur}px); }
      }
      @media (prefers-reduced-transparency: reduce) {
        .bg-overlay-backdrop { backdrop-filter: none; -webkit-backdrop-filter: none; background-image: none; background-color: #171b20; }
      }
    `);
  }
  if (config.enableTimelinePolish) {
    // Keep virtual row positioning under host control; its ResizeObserver measures content.
    parts.push(`
      [data-virtual-inner] .bg-bubble-user {
        border-radius: 8px;
        box-shadow: inset 0 0 0 1px #ffffff18, 0 2px 5px #0000000d;
      }
      [data-virtual-inner] .prose-chat {
        color: var(--color-text-primary);
        text-decoration-color: var(--ms-timeline-accent, var(--color-accent-500));
      }
      [data-virtual-inner] .prose-chat a { color: var(--md-link-color, var(--color-accent-500)); text-underline-offset: 3px; }
      [data-virtual-inner] .prose-chat blockquote {
        border-inline-start-color: var(--ms-timeline-accent, var(--color-accent-500));
        background-color: var(--ms-timeline-surface, var(--color-background-secondary-default));
      }
      [data-virtual-inner] .prose-chat :is(th, thead) { background-color: var(--ms-timeline-surface, var(--color-background-secondary-default)); }
      [data-virtual-inner] li > .pointer-events-none.text-foreground-icon-quaternary { color: var(--ms-timeline-guide, var(--color-separator-border)); }
      [data-virtual-inner] button[aria-expanded] { border-radius: 4px; }
      [data-virtual-inner] button[aria-expanded]:is(:hover, :focus-visible) {
        background-color: var(--ms-timeline-surface, var(--color-background-secondary-default));
      }
      [data-virtual-inner] button[aria-expanded="true"] > span { color: var(--ms-timeline-accent, var(--color-accent-500)); }
      [data-anchor-id][aria-current="location"] > span {
        background-color: var(--ms-timeline-accent, var(--color-accent-500));
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--ms-timeline-accent, var(--color-accent-500)) 12%, transparent);
      }
      nav:has([data-anchor-id]) [role="tooltip"] { border-color: var(--ms-timeline-guide, var(--color-separator-border)); border-radius: 8px; }
      [data-virtual-inner] .group:focus-within > .mt-1 :is(button, .opacity-0) { opacity: 1; }
      @media (hover: none) {
        [data-virtual-inner] .group > .mt-1 .opacity-0 { opacity: 1; }
      }
    `);
    parts.push(toolTimelineCss);
    if (config.enableGlassmorphism) parts.push(toolTimelineGlassCss);
  }
  if (config.enableFontSmoothing) {
    parts.push(
      `body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }`,
    );
  }
  if (config.enableSleekScrollbars) {
    parts.push(`
      * { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--color-text-secondary, #888) 35%, transparent) transparent; }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--color-text-secondary, #888) 35%, transparent); border-radius: 6px; }
      ::-webkit-scrollbar-thumb:hover { background: var(--color-text-secondary, #888); }
    `);
  }
  if (config.enableGlassmorphism) {
    const framed = ':is(body, #root) :is(.shadow-dropdown, .ms-flyout, [role="dialog"].bg-background-primary-default, div.rounded-2xl.border.p-2.shadow-xs)';
    parts.push(`
      ${framed} {
        background-color: var(--color-background-primary-default, #fff);
        background-image: var(--ms-glass-highlight);
        background-attachment: scroll;
        border-color: var(--ms-glass-border);
        box-shadow: inset 0 1px var(--ms-glass-edge), var(--shadow-dropdown, 0 12px 32px #00000020);
      }
      ${config.enableTimelinePolish ? `.overflow-y-auto:has(> [data-virtual-inner]) {
        box-shadow: inset 0 1px var(--ms-glass-edge);
      }` : ''}
      @supports ((backdrop-filter: blur(12px)) or (-webkit-backdrop-filter: blur(12px))) {
        ${framed} {
          background-color: var(--ms-glass-surface);
          backdrop-filter: blur(16px) saturate(115%);
          -webkit-backdrop-filter: blur(16px) saturate(115%);
        }
      }
      @media (prefers-reduced-transparency: reduce) {
        ${framed} {
          background-color: var(--color-background-primary-default, #fff);
          background-image: none;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }
      }
    `);
  }
  if (config.enableComposerGlow) {
    // Keep the persisted key compatible while applying focus feedback app-wide.
    parts.push(`
      :where(input:not([type="range"]):not([type="checkbox"]):not([type="radio"]), textarea, select):focus-visible,
      :where(button, [role="tab"], [role="switch"]):focus-visible,
      div.rounded-2xl.border.p-2.shadow-xs:focus-within {
        outline: 2px solid var(--color-border-focus-ring, #3b82f6);
        outline-offset: 2px;
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-border-focus-ring, #3b82f6) 12%, transparent);
      }
    `);
  }
  if (config.enableCardPolish) {
    parts.push(`
      .prose-chat pre {
        border: 1px solid var(--color-separator-border, #ddd);
        border-radius: 8px;
        background-color: var(--md-codeblock-bg, var(--color-background-secondary-default, #f7f7f7));
      }
      .prose-chat code { font-feature-settings: "liga" 1, "calt" 1; }
      .prose-chat :not(pre) > code { border-radius: 4px; }
      .prose-chat table { border-color: var(--color-border-table, #ddd); }
    `);
  }
  const hasImage = config.backgroundEnabled && isBackgroundImage(config.backgroundImage);
  if (palette || hasImage) {
    // Fixed attachment aligns the same image across opaque host surfaces, including portals.
    // Keep controls, selected rows and code/result panels on their semantic colors.
    const surfaces = `:is(body, #root,
      :is(div, main, section, aside, header, footer, nav)[class~="bg-background-full"]:not([data-virtual-inner] *),
      :is(div, main, section, aside, header, footer, nav)[class~="bg-background-primary-default"]:not([data-virtual-inner] *),
      :is(div, main, section, aside, header, footer, nav)[class~="bg-background-secondary-default"]:not([data-virtual-inner] *),
      .overflow-y-auto:has(> [data-virtual-inner]), .ms-flyout, .ms-channels,
      [role="dialog"], .shadow-dropdown)`;
    const canvas = 'var(--ms-canvas, var(--color-background-full, #f2f2f2))';
    const dim = Number.isFinite(config.backgroundDim) ? Math.max(0, Math.min(100, config.backgroundDim)) : 65;
    const wash = `color-mix(in srgb, ${canvas} ${dim}%, transparent)`;
    parts.push(`${surfaces} {
      background-color: ${canvas};
      background-image: ${hasImage ? `linear-gradient(${wash}, ${wash}), var(--ms-background-image, none)` : 'none'};
      background-size: auto, ${config.backgroundFit === 'contain' ? 'contain' : 'cover'};
      background-position: center;
      background-repeat: no-repeat;
      background-attachment: fixed;
      ${hasImage ? 'backdrop-filter: none; -webkit-backdrop-filter: none;' : ''}
    }`);
    if (hasImage && /^data:image\/(gif|webp);/i.test(config.backgroundImage!)) parts.push(`
      @media (prefers-reduced-motion: reduce) { ${surfaces} { background-image: none; } }
    `);
  }
  if (config.customCss?.trim()) parts.push(config.customCss.trim());
  return parts.join("\n");
}

/**
 * 主题管理器类：负责注入与热更新样式
 */
export class GuiThemeManager {
  private ctx: PluginContext;
  private currentDisposer: (() => void) | null = null;
  private imageDisposer: (() => void) | null = null;
  private appliedImage = "";
  private saveQueue: Promise<void> = Promise.resolve();
  private config: GuiThemeConfig = { ...DEFAULT_THEME_CONFIG };
  private listeners = new Set<(cfg: GuiThemeConfig) => void>();

  constructor(ctx: PluginContext) {
    this.ctx = ctx;
  }

  public async init(): Promise<void> {
    try {
      const saved = await this.ctx.storage.get<GuiThemeConfig>("theme_config");
      if (saved) {
        this.config = { ...DEFAULT_THEME_CONFIG, ...saved, canvasStyle: "plain" };
      }
      const image = await this.ctx.storage.get<string>("theme_background");
      if (isBackgroundImage(image)) this.config.backgroundImage = image;
    } catch (e) {
      console.warn("[model-switcher:theme] 读取主题设置失败:", e);
    }
    this.apply();
  }

  public getConfig(): GuiThemeConfig {
    return { ...this.config };
  }

  public subscribe(fn: (cfg: GuiThemeConfig) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public async updateConfig(partial: Partial<GuiThemeConfig>): Promise<void> {
    this.config = { ...this.config, ...partial, canvasStyle: "plain" };
    this.apply();
    this.listeners.forEach((fn) => fn(this.config));
    const { backgroundImage, ...settings } = this.config;
    // Serialize slider/picker writes and keep large media out of ordinary settings writes.
    const save = this.saveQueue.then(async () => {
      if (Object.prototype.hasOwnProperty.call(partial, "backgroundImage")) {
        await this.ctx.storage.set("theme_background", isBackgroundImage(backgroundImage) ? backgroundImage : null);
      }
      await this.ctx.storage.set("theme_config", settings);
    });
    this.saveQueue = save.catch(e => { console.warn("[model-switcher:theme] 保存主题配置失败:", e); });
    return save;
  }

  public apply(): void {
    const image = this.config.backgroundEnabled && isBackgroundImage(this.config.backgroundImage) ? this.config.backgroundImage : "";
    if (image !== this.appliedImage) {
      this.imageDisposer?.();
      this.imageDisposer = image ? this.ctx.theme.injectCss(`:root { --ms-background-image: url("${image}"); }`) : null;
      this.appliedImage = image;
    }
    if (this.currentDisposer) {
      this.currentDisposer();
      this.currentDisposer = null;
    }
    const css = generateThemeCss(this.config);
    if (css && css.trim()) {
      try {
        this.currentDisposer = this.ctx.theme.injectCss(css);
      } catch (err) {
        console.warn("[model-switcher:theme] 注入主题 CSS 失败:", err);
      }
    }
  }

  public dispose(): void {
    this.imageDisposer?.();
    this.imageDisposer = null;
    this.appliedImage = "";
    if (this.currentDisposer) {
      this.currentDisposer();
      this.currentDisposer = null;
    }
    this.listeners.clear();
  }
}
