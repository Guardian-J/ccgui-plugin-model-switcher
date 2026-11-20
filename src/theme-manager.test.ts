import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "./ccgui-plugin";
import { GuiThemeManager, type GuiThemeConfig } from "./theme-manager";

function createThemeContext(getConfig: () => Promise<GuiThemeConfig | undefined> = async () => undefined) {
  let activeStyles = 0;
  const get = vi.fn(getConfig);
  const set = vi.fn(async () => undefined);
  const injectCss = vi.fn(() => {
    activeStyles++;
    return () => { activeStyles--; };
  });
  const ctx = {
    storage: { get, set },
    theme: { injectCss },
  } as unknown as PluginContext;
  return { ctx, get, set, injectCss, activeStyles: () => activeStyles };
}

describe("GuiThemeManager 生命周期", () => {
  it("clearStyles 使尚未完成的 init 失效", async () => {
    const pendingConfig = Promise.withResolvers<GuiThemeConfig | undefined>();
    const host = createThemeContext(() => pendingConfig.promise);
    const manager = new GuiThemeManager(host.ctx);

    const initializing = manager.init();
    manager.clearStyles();
    pendingConfig.resolve(undefined);
    await initializing;

    expect(host.injectCss).not.toHaveBeenCalled();
  });

  it("同一 manager 在 clearStyles 后仍可 apply、update 并通知订阅者", async () => {
    const host = createThemeContext();
    const manager = new GuiThemeManager(host.ctx);
    const listener = vi.fn();
    manager.subscribe(listener);
    await manager.apply();

    expect(host.activeStyles()).toBe(1);
    manager.clearStyles();
    expect(host.activeStyles()).toBe(0);

    await manager.apply();
    expect(host.activeStyles()).toBe(1);

    await manager.updateConfig({ customCss: ".theme-test { color: red; }" });
    expect(host.activeStyles()).toBe(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      customCss: ".theme-test { color: red; }",
    }));
    expect(host.set).toHaveBeenCalledWith("theme_config", expect.objectContaining({
      customCss: ".theme-test { color: red; }",
    }));
  });
});
