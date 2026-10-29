import type { PluginState } from "./types";

export interface StateStore {
  get(): PluginState;
  subscribe(listener: () => void): () => void;
  /**
   * 应用首次读盘结果(读盘失败传 null)。读盘前发起的保存会等到这里再写盘,
   * 且只把这些保存改动过的顶层字段合并到读出的状态上,不用默认值覆盖磁盘。
   */
  hydrate(saved: PluginState | null): void;
  /** 先乐观更新并通知;最新一次保存失败时回滚到最后一次确认写盘的状态后继续抛错。 */
  save(next: PluginState): Promise<void>;
  dispose(): void;
}

type StateKey = keyof PluginState;

export function createStateStore(
  initial: PluginState,
  persist: (state: PluginState) => Promise<void>,
): StateStore {
  let current = initial;
  /** 最后一次确认已落盘(或读盘得到)的状态,失败回滚的唯一目标。 */
  let committed = initial;
  let committedVersion = 0;
  let version = 0;
  /** 回滚发生时的 version;之后无新保存时,较晚成功的旧保存可恢复为当前状态。 */
  let rolledBackAt = -1;
  let disposed = false;
  let hydrated = false;
  /** 读盘前的保存改动过的顶层字段;读盘后这些字段以内存为准,其余以磁盘为准。 */
  const dirtyKeys = new Set<StateKey>();
  let releaseHydrated!: () => void;
  const hydratedGate = new Promise<void>((resolve) => {
    releaseHydrated = resolve;
  });
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());

  const rebase = (base: PluginState, overlay: PluginState): PluginState => {
    const merged = { ...base } as Record<StateKey, unknown>;
    for (const key of dirtyKeys) merged[key] = overlay[key];
    return merged as PluginState;
  };

  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hydrate(saved) {
      if (disposed || hydrated) return;
      hydrated = true;
      if (saved) {
        committed = saved;
        current = rebase(saved, current);
        notify();
      }
      releaseHydrated();
    },
    async save(next) {
      const saveVersion = ++version;
      const beforeHydration = !hydrated;
      if (beforeHydration) {
        const keys = new Set([...Object.keys(current), ...Object.keys(next)] as StateKey[]);
        for (const key of keys) if (current[key] !== next[key]) dirtyKeys.add(key);
      }
      current = next;
      notify();
      await hydratedGate;
      if (disposed) return;
      // 读盘前的保存基于默认状态构造,写盘前合并到读出的状态,避免覆盖磁盘上的其它字段。
      const toPersist = beforeHydration ? rebase(committed, next) : next;
      try {
        await persist(toPersist);
      } catch (err) {
        if (!disposed && saveVersion === version) {
          current = committed;
          rolledBackAt = version;
          notify();
        }
        throw err;
      }
      if (disposed || saveVersion < committedVersion) return;
      committed = toPersist;
      committedVersion = saveVersion;
      if (rolledBackAt === version) {
        current = toPersist;
        notify();
      }
    },
    dispose() {
      disposed = true;
      listeners.clear();
      releaseHydrated();
    },
  };
}
