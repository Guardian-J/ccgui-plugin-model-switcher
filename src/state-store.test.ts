import { describe, it, expect } from 'vitest';
import { createStateStore } from './state-store';
import { DEFAULT_STATE } from './constants';
import type { PluginState } from './types';

function deferred() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const withCli = (cli: string): PluginState => ({ ...DEFAULT_STATE, selectedCli: cli } as PluginState);

describe('state-store', () => {
  it('读盘前的保存等读盘后再写，只覆盖改动过的字段，不用默认值冲掉磁盘', async () => {
    const written: PluginState[] = [];
    const store = createStateStore(withCli('claude'), async (s) => {
      written.push(s);
    });
    const p = store.save(withCli('omp'));
    expect(store.get().selectedCli).toBe('omp');
    expect(written).toHaveLength(0);

    const disk = { ...withCli('codex'), enableTheme: false } as PluginState;
    store.hydrate(disk);
    await p;

    expect(written).toHaveLength(1);
    expect(written[0].selectedCli).toBe('omp');
    expect(written[0].enableTheme).toBe(false);
    expect(store.get().selectedCli).toBe('omp');
    expect(store.get().enableTheme).toBe(false);
  });

  it('读盘失败时读盘前的保存照常写入', async () => {
    const written: PluginState[] = [];
    const store = createStateStore(withCli('claude'), async (s) => {
      written.push(s);
    });
    const p = store.save(withCli('omp'));
    store.hydrate(null);
    await p;
    expect(written.map((s) => s.selectedCli)).toEqual(['omp']);
  });

  it('写盘失败时回滚到之前的状态并抛错', async () => {
    const store = createStateStore(withCli('claude'), async () => {
      throw new Error('disk');
    });
    store.hydrate(withCli('claude'));
    let notified = 0;
    store.subscribe(() => notified++);
    await expect(store.save(withCli('omp'))).rejects.toThrow('disk');
    expect(store.get().selectedCli).toBe('claude');
    expect(notified).toBe(2);
  });

  it('较早的保存失败时不回滚后续已发起的保存', async () => {
    const first = deferred();
    const store = createStateStore(withCli('claude'), (next) =>
      next.selectedCli === 'omp' ? first.promise : Promise.resolve(),
    );
    store.hydrate(withCli('claude'));
    const p1 = store.save(withCli('omp'));
    await store.save(withCli('pi'));
    first.reject(new Error('slow fail'));
    await expect(p1).rejects.toThrow('slow fail');
    expect(store.get().selectedCli).toBe('pi');
  });

  it('dispose 后写盘失败不再回滚或通知', async () => {
    const gate = deferred();
    const store = createStateStore(withCli('claude'), () => gate.promise);
    store.hydrate(withCli('claude'));
    let notified = 0;
    store.subscribe(() => notified++);
    const p = store.save(withCli('omp'));
    await Promise.resolve();
    store.dispose();
    gate.reject(new Error('late'));
    await expect(p).rejects.toThrow('late');
    expect(store.get().selectedCli).toBe('omp');
    expect(notified).toBe(1);
  });

  it('读盘前 dispose 不再写盘', async () => {
    const written: PluginState[] = [];
    const store = createStateStore(withCli('claude'), async (s) => {
      written.push(s);
    });
    const p = store.save(withCli('omp'));
    store.dispose();
    await p;
    expect(written).toHaveLength(0);
  });
});
