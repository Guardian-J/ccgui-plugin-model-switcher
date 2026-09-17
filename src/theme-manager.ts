import type { PluginContext } from "./ccgui-plugin";
import { paletteCss, THEME_PALETTES } from "./theme-palette";
import { toolTimelineCss } from "./tool-timeline-theme";
import { customThemeColor, paletteFromColor, type CustomPalette } from "./theme-customization";

export interface GuiThemeConfig {
  /** 主题预设 */
  preset: "default" | keyof typeof THEME_PALETTES;
  paletteMode: "preset" | "custom";
  customPalette?: CustomPalette;
  customAccent?: string;
  /** Legacy texture setting; normalized to plain on load. */
  canvasStyle: "plain" | "grid" | "diagonal";
  enableBackdropPolish: boolean;
  backdropOpacity: number;
  backdropBlur: number;
  enableTimelinePolish: boolean;
  /** 会话页签精修（当前会话纯净卡片高亮浮起） */
  enableTabPolish: boolean;
  /** Legacy: 毛玻璃设置，保留字段以兼容旧配置 */
  enableGlassmorphism?: boolean;
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
  canvasStyle: "plain",
  enableBackdropPolish: true,
  backdropOpacity: 45,
  backdropBlur: 6,
  enableTimelinePolish: true,
  enableTabPolish: true,
  enableGlassmorphism: false,
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
    name: "深空雅致 (Deep Slate)",
    desc: "通透沉稳的深空色调与克制层次感",
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
  if (config.enableBackdropPolish) {
    const opacity = Number.isFinite(config.backdropOpacity) ? Math.min(80, Math.max(20, config.backdropOpacity)) : 45;
    const blur = Number.isFinite(config.backdropBlur) ? Math.min(16, Math.max(0, config.backdropBlur)) : 6;
    parts.push(`
      :root { --color-overlay-backdrop: color-mix(in srgb, var(--ms-backdrop-ink, #18202a) ${opacity}%, transparent); }
      .bg-overlay-backdrop { background-color: var(--color-overlay-backdrop); }
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

  if (config.enableTabPolish) {
    // 顶栏会话页签（SessionTabStrip）微调：采用 Linear/macOS 分段卡片质感，克制清晰
    parts.push(`
      /* 当前激活会话页签：纯白/高对比立体浮起卡片，清晰但克制 */
      [role="tablist"] > div[data-tab-key]:has([role="tab"][aria-selected="true"]),
      [role="tablist"] > div[data-tab-key].bg-background-secondary-default {
        background-color: #ffffff !important;
        color: var(--color-text-primary, #111827) !important;
        font-weight: 500 !important;
        border: 1px solid color-mix(in srgb, var(--color-separator-border, #d1d5db) 75%, transparent) !important;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06), 0 1px 1px rgba(0, 0, 0, 0.04) !important;
      }

      :root.dark [role="tablist"] > div[data-tab-key]:has([role="tab"][aria-selected="true"]),
      :root.dark [role="tablist"] > div[data-tab-key].bg-background-secondary-default,
      .dark [role="tablist"] > div[data-tab-key]:has([role="tab"][aria-selected="true"]),
      .dark [role="tablist"] > div[data-tab-key].bg-background-secondary-default {
        background-color: var(--color-background-primary-default, #1e2023) !important;
        color: var(--color-text-primary, #f3f4f6) !important;
        border: 1px solid color-mix(in srgb, var(--color-separator-border, #4b5563) 60%, transparent) !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
      }
    `);
  }

  if (palette) {
    const surfaces = `:is(body, #root,
      :is(div, main, section, aside, header, footer, nav)[class~="bg-background-full"]:not([data-virtual-inner] *),
      :is(div, main, section, aside, header, footer, nav)[class~="bg-background-primary-default"]:not([data-virtual-inner] *),
      :is(div, main, section, aside, header, footer, nav)[class~="bg-background-secondary-default"]:not([data-virtual-inner] *):not([data-tab-key]),
      .overflow-y-auto:has(> [data-virtual-inner]), .ms-flyout, .ms-channels,
      [role="dialog"], .shadow-dropdown)`;
    const canvas = 'var(--ms-canvas, var(--color-background-full, #f2f2f2))';
    parts.push(`${surfaces} {
      background-color: ${canvas};
      background-image: none;
      background-attachment: fixed;
    }`);
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
    const save = this.saveQueue.then(async () => {
      await this.ctx.storage.set("theme_config", this.config);
    });
    this.saveQueue = save.catch(e => { console.warn("[model-switcher:theme] 保存主题配置失败:", e); });
    return save;
  }

  public apply(): void {
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
    if (this.currentDisposer) {
      this.currentDisposer();
      this.currentDisposer = null;
    }
    this.listeners.clear();
  }
}
