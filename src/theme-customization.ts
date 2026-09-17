import { THEME_PALETTES, type Colors } from "./theme-palette";

export type CustomPalette = { light: Colors; dark: Colors };

export function customThemeColor(color: string | undefined, legacy: CustomPalette | undefined, preset: string): string {
  const candidate = color ?? legacy?.light?.accent;
  return /^#[0-9a-f]{6}$/i.test(candidate || "") ? candidate! : customPaletteBase(preset).light.accent;
}

export function paletteFromColor(color: string): CustomPalette {
  const seed = customThemeColor(color, undefined, 'graphite');
  const mix = (base: string, amount: number) => '#' + [1, 3, 5].map(index =>
    Math.round(parseInt(seed.slice(index, index + 2), 16) * (1 - amount) +
      parseInt(base.slice(index, index + 2), 16) * amount).toString(16).padStart(2, '0')).join('');
  const luminance = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  let accent = seed;
  // White button/bubble labels must stay legible even for a pale selected color.
  for (let amount = .05; luminance(accent) > .183 && amount <= 1; amount += .05) accent = mix('#000000', amount);
  return {
    light: { ...THEME_PALETTES.graphite.light, accent, bright: accent, canvas: mix('#f1f3f4', .96) },
    dark: { ...THEME_PALETTES.graphite.dark, accent, bright: mix('#ffffff', .6), canvas: mix('#17191b', .96) },
  };
}

export function normalizePalette(palette: CustomPalette | undefined, fallback: CustomPalette): CustomPalette {
  const variant = (mode: "light" | "dark"): Colors => Object.fromEntries(
    Object.entries(fallback[mode]).map(([key, value]) => [key,
      /^#[0-9a-f]{6}$/i.test(palette?.[mode]?.[key as keyof Colors] || "")
        ? palette![mode][key as keyof Colors] : value]),
  ) as unknown as Colors;
  return { light: variant("light"), dark: variant("dark") };
}

export function customPaletteBase(preset: string): CustomPalette {
  return Object.prototype.hasOwnProperty.call(THEME_PALETTES, preset)
    ? THEME_PALETTES[preset as keyof typeof THEME_PALETTES] : THEME_PALETTES.acrylic;
}


