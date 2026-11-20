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
            let local: string | null = null;
            try {
              local = localStorage.getItem(prefix + key);
            } catch (error) {
              // 浏览器禁用存储访问时，远程宿主仍是可信数据源。
              if (typeof error !== "object" || error === null || !("name" in error) || error.name !== "SecurityError") {
                throw error;
              }
            }
            if (local !== null) {
              try {
                return JSON.parse(local) as T | null;
              } catch {
                // 损坏的本地回退值不能永久遮蔽远程数据。
                try {
                  localStorage.removeItem(prefix + key);
                } catch {
                  // 清理失败不妨碍回退远程读取。
                }
              }
            }
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
          } catch (error) {
            if (!/unknown command:\s*plugin_storage_(set|delete)\b/i.test(String(error))) throw error;
            // 远程写入不可用时退回 localStorage；本地写入失败必须上抛，不能静默丢数据。
            localStorage.setItem(prefix + key, JSON.stringify(value));
            return;
          }
          try {
            // 远程写入已成功，缓存清理异常不代表本次操作失败。
            localStorage.removeItem(prefix + key);
          } catch {
            // 忽略清理异常。
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
          } catch (error) {
            if (!/unknown command:\s*plugin_storage_(set|delete)\b/i.test(String(error))) throw error;
            localStorage.setItem(prefix + key, "null");
            return;
          }
          try {
            localStorage.removeItem(prefix + key);
          } catch {
            // 远程删除已成功，忽略缓存清理异常。
          }
        });
      },
    },
  };
}
