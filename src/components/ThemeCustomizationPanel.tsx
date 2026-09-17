import { React } from "../react-context";
import type { GuiThemeConfig } from "../theme-manager";
import { customThemeColor } from "../theme-customization";

interface Props {
  config: GuiThemeConfig;
  update: (partial: Partial<GuiThemeConfig>) => Promise<void>;
}

/**
 * 调色盘自定义面板：仅保留主题色选择器
 */
export function ThemeCustomizationPanel({ config, update }: Props) {
  const color = customThemeColor(config.customAccent, config.customPalette, config.preset);
  return <div className="ms-custom-palette">
    <label className="ms-color-field">
      <input type="color" aria-label="主题色" value={color}
        onChange={event => void update({ customAccent: event.target.value })} />
      <span>主题色<code>{color.toUpperCase()}</code></span>
    </label>
  </div>;
}
