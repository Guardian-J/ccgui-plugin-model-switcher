import type { PluginContext } from "./ccgui-plugin";
import { isRemoteHost } from "./host-transport";

/** Older remote hosts expose plugin_storage_get but not set/delete. */
export function withRemoteStorage(ctx: PluginContext): PluginContext {
  if (!isRemoteHost()) return ctx;
  const prefix = `ccgui.plugin.remote:${ctx.pluginId}:`;
  const unsupported = (error: unknown) => /unknown command:\s*plugin_storage_(set|delete)\b/i.test(String(error));
  return { ...ctx, storage: {
    async get<T>(key: string): Promise<T | null> {
      const local = localStorage.getItem(prefix + key);
      if (local !== null) return JSON.parse(local) as T | null;
      return ctx.storage.get<T>(key);
    },
    async set(key, value) {
      try {
        await ctx.storage.set(key, value);
        localStorage.removeItem(prefix + key);
      } catch (error) {
        if (!unsupported(error)) throw error;
        localStorage.setItem(prefix + key, JSON.stringify(value));
      }
    },
    async delete(key) {
      try {
        await ctx.storage.delete(key);
        localStorage.removeItem(prefix + key);
      } catch (error) {
        if (!unsupported(error)) throw error;
        localStorage.setItem(prefix + key, "null");
      }
    },
  } };
}
