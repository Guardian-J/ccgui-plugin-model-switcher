import { THEME_PALETTES, type Colors } from "./theme-palette";

export type CustomPalette = { light: Colors; dark: Colors };
export const MAX_BACKGROUND_BYTES = 4 * 1024 * 1024;

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

export function isBackgroundImage(value: unknown): value is string {
  return typeof value === "string" && value.length <= Math.ceil(MAX_BACKGROUND_BYTES / 3) * 4 + 64 &&
    /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(value);
}

export async function readBackgroundFile(file: File): Promise<string> {
  if (file.size > MAX_BACKGROUND_BYTES) throw new Error("图片不能超过 4 MB");
  if (!file.size) throw new Error("图片文件为空");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const starts = (...header: number[]) => header.every((byte, index) => bytes[index] === byte);
  const mime = starts(137, 80, 78, 71, 13, 10, 26, 10) ? "image/png"
    : starts(255, 216, 255) ? "image/jpeg"
      : starts(71, 73, 70, 56) ? "image/gif"
        : starts(82, 73, 70, 70) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80 ? "image/webp" : null;
  if (!mime) throw new Error("请选择 PNG、JPEG、WebP 或 GIF 图片");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(new Blob([file], { type: mime }));
  });
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth * image.naturalHeight <= 40_000_000
      ? resolve() : reject(new Error("图片尺寸过大，请使用不超过 4000 万像素的图片"));
    image.onerror = () => reject(new Error("图片损坏或格式不受支持"));
    image.src = data;
  });
  // Keep original bytes, so GIF/WebP animation survives import and reload.
  return data;
}
