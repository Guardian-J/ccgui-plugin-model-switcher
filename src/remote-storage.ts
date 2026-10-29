import type { PluginContext } from "./ccgui-plugin";
import { enqueueSerial, isRemoteHost } from "./host-transport";

/**
 * Serialize per-key plugin storage reads and mutations so rapid set/delete
 * calls settle in call order, and a read issued after a write observes it,
 * even on older hosts whose `ctx.storage` was not serialized, while
 * preserving localStorage fallback on older remote hosts.
 */
export function withRemoteStorage(ctx: PluginContext): PluginContext {
  const remote = isRemoteHost();
  const prefix = `ccgui.plugin.remote:${ctx.pluginId}:`;
  return {
    ...ctx,
    storage: {
      async get<T>(key: string): Promise<T | null> {
        return enqueueSerial(`ctx_storage:${ctx.pluginId}:${key}`, async () => {
          if (remote) {
            const local = localStorage.getItem(prefix + key);
            if (local !== null) return JSON.parse(local) as T | null;
          }
          return ctx.storage.get<T>(key);
        });
      },
      async set(key, value) {
        return enqueueSerial(`ctx_storage:${ctx.pluginId}:${key}`, async () => {
          if (!remote) {
            await ctx.storage.set(key, value);
            return;
          }
          try {
            await ctx.storage.set(key, value);
            localStorage.removeItem(prefix + key);
          } catch (error) {
            if (!/unknown command:\s*plugin_storage_(set|delete)\b/i.test(String(error))) throw error;
            localStorage.setItem(prefix + key, JSON.stringify(value));
          }
        });
      },
      async delete(key) {
        return enqueueSerial(`ctx_storage:${ctx.pluginId}:${key}`, async () => {
          if (!remote) {
            await ctx.storage.delete(key);
            return;
          }
          try {
            await ctx.storage.delete(key);
            localStorage.removeItem(prefix + key);
          } catch (error) {
            if (!/unknown command:\s*plugin_storage_(set|delete)\b/i.test(String(error))) throw error;
            localStorage.setItem(prefix + key, "null");
          }
        });
      },
    },
  };
}
