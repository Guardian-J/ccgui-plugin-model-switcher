import { React, useState, useRef, useEffect } from "../react-context";
import type { GuiThemeConfig } from "../theme-manager";
import { customThemeColor, readBackgroundFile } from "../theme-customization";
import { PlusIcon, TrashIcon } from "../icons";

interface Props {
  config: GuiThemeConfig;
  update: (partial: Partial<GuiThemeConfig>) => Promise<void>;
  section: "palette" | "background";
}

export function ThemeCustomizationPanel({ config, update, section }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const color = customThemeColor(config.customAccent, config.customPalette, config.preset);
  if (section === "palette") return <div className="ms-custom-palette">
    <label className="ms-color-field">
      <input type="color" aria-label="主题色" value={color}
        onChange={event => void update({ customAccent: event.target.value })} />
      <span>主题色<code>{color.toUpperCase()}</code></span>
    </label>
  </div>;

  const importFile = async (file?: File) => {
    if (!file) return;
    const id = ++request.current;
    setLoading(true); setError("");
    try {
      const data = await readBackgroundFile(file);
      if (id !== request.current) return;
      await update({ backgroundImage: data, backgroundName: file.name, backgroundEnabled: true });
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : "图片导入失败");
    } finally {
      if (id === request.current) setLoading(false);
    }
  };
  return <div className="ms-image-settings">
    <div className="ms-theme-modes" role="group" aria-label="应用背景类型">
      <button type="button" aria-pressed={!config.backgroundEnabled} onClick={() => {
        request.current++; setLoading(false); setError("");
        void update({ backgroundEnabled: false });
      }}>纯色</button>
      <button type="button" aria-pressed={config.backgroundEnabled} onClick={() => {
        if (config.backgroundImage) void update({ backgroundEnabled: true });
        else fileInput.current?.click();
      }}>图片 / GIF</button>
    </div>
    <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif"
      aria-label="选择背景图片" onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ""; }} />
    <div className="ms-image-toolbar">
      <button type="button" className="ms-image-import" disabled={loading} onClick={() => fileInput.current?.click()}>
        <PlusIcon />{loading ? "正在导入…" : config.backgroundImage ? "更换图片 / GIF" : "导入图片 / GIF"}
      </button>
      {config.backgroundImage && <>
        <button type="button" className="ms-icon-button" title="移除背景图片" aria-label="移除背景图片" onClick={() => {
          request.current++; setLoading(false); setError("");
          void update({ backgroundImage: "", backgroundName: "", backgroundEnabled: false });
        }}><TrashIcon /></button>
      </>}
    </div>
    {error && <div role="alert" className="ms-status">{error}</div>}
    {config.backgroundImage && <>
      <div className="ms-image-preview"><img src={config.backgroundImage} alt={config.backgroundName || "应用背景"} style={{ objectFit: config.backgroundFit }} /></div>
      <div className="ms-image-name" title={config.backgroundName}>{config.backgroundName}</div>
      <div className="ms-theme-modes" role="group" aria-label="图片适配">
        <button type="button" aria-pressed={config.backgroundFit === "cover"} onClick={() => void update({ backgroundFit: "cover" })}>铺满</button>
        <button type="button" aria-pressed={config.backgroundFit === "contain"} onClick={() => void update({ backgroundFit: "contain" })}>完整显示</button>
      </div>
      <label className="ms-theme-slider ms-image-dim"><span>阅读遮罩<output>{config.backgroundDim}%</output></span>
        <div className="ms-effort-track"><div className="ms-effort-fill" style={{ width: `calc(${config.backgroundDim / 100} * (100% - 21px) + 21px)` }} />
          <input className="ms-range" aria-label="阅读遮罩" type="range" min="0" max="100" step="5" value={config.backgroundDim}
            onChange={event => void update({ backgroundDim: Number(event.target.value) })} /></div>
      </label>
    </>}
  </div>;
}
