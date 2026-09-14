export interface Colors {
  accent: string;
  bright: string;
  canvas: string;
  surface: string;
  panel: string;
  text: string;
  muted: string;
  border: string;
}

export const THEME_PALETTES = {
  acrylic: {
    light: {
      accent: "#4f46c8",
      bright: "#6861dc",
      canvas: "#eff1f6",
      surface: "#fcfcfe",
      panel: "#f3f4f8",
      text: "#252735",
      muted: "#606475",
      border: "#dadde7",
    },
    dark: {
      accent: "#5148c6",
      bright: "#aaa5ff",
      canvas: "#17181d",
      surface: "#22232a",
      panel: "#1c1d24",
      text: "#eeeef4",
      muted: "#b1b2c2",
      border: "#3c3d49",
    },
  },
  cyberpunk: {
    light: {
      accent: "#b71963",
      bright: "#cb2b75",
      canvas: "#f1eef3",
      surface: "#fffbfe",
      panel: "#f7eff5",
      text: "#302333",
      muted: "#756171",
      border: "#e3d4df",
    },
    dark: {
      accent: "#b71963",
      bright: "#ff84bb",
      canvas: "#171519",
      surface: "#252027",
      panel: "#1d191f",
      text: "#f5eaf2",
      muted: "#c6aebf",
      border: "#483645",
    },
  },
  nordic: {
    light: {
      accent: "#096c8c",
      bright: "#147c9c",
      canvas: "#edf2f4",
      surface: "#fafcfd",
      panel: "#f0f5f7",
      text: "#24343b",
      muted: "#5d7079",
      border: "#d4e0e5",
    },
    dark: {
      accent: "#086482",
      bright: "#75cce5",
      canvas: "#191f22",
      surface: "#242d32",
      panel: "#1e262a",
      text: "#e9f1f4",
      muted: "#adc1cb",
      border: "#3e5059",
    },
  },
  sakura: {
    light: {
      accent: "#b82e56",
      bright: "#c63e65",
      canvas: "#f7eff1",
      surface: "#fffcfd",
      panel: "#fcf3f5",
      text: "#39282f",
      muted: "#7b626c",
      border: "#e9d6dd",
    },
    dark: {
      accent: "#ac294d",
      bright: "#f69aaf",
      canvas: "#211a1d",
      surface: "#2e2429",
      panel: "#271f23",
      text: "#f5e9ed",
      muted: "#cbb0ba",
      border: "#4e3942",
    },
  },
  emerald: {
    light: {
      accent: "#087853",
      bright: "#148764",
      canvas: "#edf4f0",
      surface: "#fbfdfc",
      panel: "#f0f7f3",
      text: "#25382f",
      muted: "#5c7266",
      border: "#d2e3d9",
    },
    dark: {
      accent: "#08704e",
      bright: "#6cd7a9",
      canvas: "#171e1b",
      surface: "#222d27",
      panel: "#1c2520",
      text: "#e9f3ed",
      muted: "#adc6b7",
      border: "#3b5144",
    },
  },
  graphite: {
    light: { accent: "#42515e", bright: "#526979", canvas: "#eef0f0", surface: "#ffffff", panel: "#f3f4f4", text: "#25292b", muted: "#5c666b", border: "#d8dfe0" },
    dark: { accent: "#465963", bright: "#97c5ca", canvas: "#151718", surface: "#222526", panel: "#1b1e1f", text: "#f0f3f2", muted: "#aeb9ba", border: "#3c4547" },
  },
  ocean: {
    light: { accent: "#086c77", bright: "#0b7c89", canvas: "#edf3f4", surface: "#ffffff", panel: "#f0f5f5", text: "#243438", muted: "#566e74", border: "#cedfe1" },
    dark: { accent: "#096575", bright: "#6dd2ce", canvas: "#161c1e", surface: "#232d30", panel: "#1c2527", text: "#e8f4f3", muted: "#a5c1c3", border: "#3a5156" },
  },
  cobalt: {
    light: { accent: "#2858b9", bright: "#396acb", canvas: "#eef1f5", surface: "#ffffff", panel: "#f2f4f8", text: "#292e38", muted: "#616b7b", border: "#d8dfeb" },
    dark: { accent: "#2c56ac", bright: "#9ebfff", canvas: "#191a1e", surface: "#25272d", panel: "#202126", text: "#f0f2f8", muted: "#b1b8c9", border: "#414652" },
  },
  plum: {
    light: { accent: "#854273", bright: "#995486", canvas: "#f3f0f2", surface: "#fffefe", panel: "#f6f3f5", text: "#342c34", muted: "#736372", border: "#e1d8df" },
    dark: { accent: "#803969", bright: "#dfa6cc", canvas: "#1b181b", surface: "#2b242a", panel: "#221e22", text: "#f6edf3", muted: "#c6b2c1", border: "#4c3d48" },
  },
  terminal: {
    light: { accent: "#3a672d", bright: "#507b39", canvas: "#f0f3ef", surface: "#ffffff", panel: "#f3f6f1", text: "#293128", muted: "#626e5d", border: "#d6dfd0" },
    dark: { accent: "#3b652b", bright: "#a3d679", canvas: "#141613", surface: "#22251f", panel: "#1a1d18", text: "#eff4e8", muted: "#b4c0a6", border: "#3e4936" },
  },
  vermilion: {
    light: { accent: "#b03838", bright: "#c14a47", canvas: "#f4f1f1", surface: "#ffffff", panel: "#f7f3f3", text: "#352c2c", muted: "#756363", border: "#e4d7d7" },
    dark: { accent: "#a63538", bright: "#f49c95", canvas: "#1b1818", surface: "#2b2525", panel: "#221e1e", text: "#f6eeed", muted: "#c9b3b0", border: "#4d3e3e" },
  },
} satisfies Record<string, { light: Colors; dark: Colors }>;

export function paletteCss(colors: Colors, dark: boolean): string {
  const { accent, bright, canvas, surface, panel, text, muted, border } =
    colors;
  const mix = (color: string, amount: number, base: string) =>
    `color-mix(in srgb, ${color} ${amount}%, ${base})`;
  const tokens: Record<string, string> = {
    "color-accent-50": mix(accent, 6, "#ffffff"),
    "color-accent-100": mix(accent, 12, "#ffffff"),
    "color-accent-200": mix(accent, 24, "#ffffff"),
    "color-accent-300": mix(accent, 40, "#ffffff"),
    "color-accent-400": bright,
    "color-accent-500": accent,
    "color-accent-600": mix(accent, 90, "#000000"),
    "color-accent-700": mix(accent, 75, "#000000"),
    "color-accent-800": mix(accent, 58, "#000000"),
    "color-accent-900": mix(accent, 42, "#000000"),
    "color-accent-950": mix(accent, 25, "#000000"),
    "color-background-full": canvas,
    "color-background-primary-default": surface,
    "color-background-inner-default": mix(text, 4, surface),
    "color-background-primary-hover": mix(bright, dark ? 14 : 8, surface),
    "color-background-primary-active": mix(bright, dark ? 22 : 14, surface),
    "color-background-primary-disabled": panel,
    "color-background-secondary-default": panel,
    "color-background-secondary-hover": mix(bright, dark ? 15 : 10, panel),
    "color-background-tertiary-default": mix(text, 8, panel),
    "color-background-tertiary-hover": mix(text, 16, panel),
    "color-background-quaternary-default": mix(text, 22, panel),
    "color-background-quaternary-hover": mix(text, 30, panel),
    "color-text-primary": text,
    "color-text-secondary": muted,
    "color-text-tertiary": muted,
    "color-text-placeholder": muted,
    "color-text-disabled": mix(muted, 55, surface),
    "color-foreground-icon-primary": text,
    "color-foreground-icon-hover": text,
    "color-foreground-icon-secondary": muted,
    "color-foreground-icon-tertiary": mix(muted, 80, surface),
    "color-foreground-icon-quaternary": mix(muted, 50, surface),
    "color-foreground-icon-disabled": mix(muted, 45, surface),
    "color-border-button-default": border,
    "color-border-button-hover": mix(muted, 60, border),
    "color-border-button-active": muted,
    "color-border-checkbox-default": mix(muted, 40, border),
    "color-border-checkbox-hover": muted,
    "color-border-checkbox-active": muted,
    "color-border-component-detail-container": border,
    "color-border-ai-profile-card": border,
    "color-border-table": border,
    "color-border-button-group": border,
    "color-border-sidebar-profile-hover": border,
    "color-separator-border": border,
    "color-separator-border-strong": mix(muted, 30, border),
    "color-border-focus-ring": dark ? bright : accent,
    "color-bubble-user": accent,
    "ms-canvas": canvas,
    "ms-canvas-line": mix(muted, dark ? 9 : 7, "transparent"),
    "ms-timeline-accent": dark ? bright : accent,
    "ms-timeline-guide": mix(bright, 35, border),
    "ms-timeline-surface": mix(bright, dark ? 5 : 3, surface),
    "ms-backdrop-ink": dark ? "#080b0e" : "#242d38",
    "gradient-button-primary-default": `linear-gradient(180deg, ${accent}, ${mix(accent, 90, "#000000")})`,
    "gradient-button-primary-hover": `linear-gradient(180deg, ${mix(accent, 90, "#ffffff")}, ${accent})`,
    "gradient-button-primary-active": `linear-gradient(180deg, ${mix(accent, 90, "#000000")}, ${mix(accent, 75, "#000000")})`,
    "color-button-ghost-background": mix(bright, 12, surface),
    "color-button-ghost-hover": mix(bright, 20, surface),
    "color-button-ghost-active": mix(bright, 28, surface),
    "color-button-ghost-foreground": dark ? bright : accent,
    "color-pill-tab-blue-selected-background": mix(bright, 12, surface),
    "color-input-disabled-background": panel,
    "md-inline-code-bg": mix(text, 7, panel),
    "md-codeblock-bg": panel,
    "md-border": border,
    "md-table-border": border,
    "md-link-color": dark ? bright : accent,
    "shadow-dropdown": "0 12px 32px -8px #00000030, 0 2px 6px #00000012",
  };
  return `${dark ? ":root.dark, .dark" : ":root"} {\n${Object.entries(tokens)
    .map(([name, value]) => `--${name}: ${value};`)
    .join("\n")}\n}`;
}
