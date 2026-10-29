import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { enqueueSerial, invokeHost, isRemoteHost } from './host-transport';

describe('host-transport', () => {
  describe('isRemoteHost', () => {
    let originalWindow: typeof globalThis.window;

    beforeEach(() => {
      originalWindow = globalThis.window;
    });

    afterEach(() => {
      globalThis.window = originalWindow;
    });

    it('应该在有 TAURI_INTERNALS 时返回 false', () => {
      globalThis.window = {
        __TAURI_INTERNALS__: { invoke: vi.fn() },
        location: { protocol: 'http:' } as any,
      } as any;

      expect(isRemoteHost()).toBe(false);
    });

    it('应该在 http/https 协议且无 TAURI_INTERNALS 时返回 true', () => {
      globalThis.window = {
        __TAURI_INTERNALS__: undefined,
        location: { protocol: 'https:' } as any,
      } as any;

      expect(isRemoteHost()).toBe(true);

      globalThis.window = {
        location: { protocol: 'http:' } as any,
      } as any;

      expect(isRemoteHost()).toBe(true);
    });

    it('应该在非 http/https 协议时返回 false', () => {
      globalThis.window = {
        location: { protocol: 'file:' } as any,
      } as any;

      expect(isRemoteHost()).toBe(false);

      globalThis.window = {
        location: { protocol: 'tauri:' } as any,
      } as any;

      expect(isRemoteHost()).toBe(false);
    });

    it('应该在无 window 时返回 false', () => {
      // @ts-expect-error 测试边界情况
      globalThis.window = undefined;

      expect(isRemoteHost()).toBe(false);
    });
  });

  describe('invokeHost 持久化串行队列', () => {
    let originalWindow: typeof globalThis.window;

    beforeEach(() => {
      originalWindow = globalThis.window;
    });

    afterEach(() => {
      globalThis.window = originalWindow;
    });

    it('同一会话连续触发 remember_session_effort 时，前一次慢调用完成后才派发后一次调用', async () => {
      const timeline: string[] = [];
      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      const invoke = vi.fn(async (cmd: string, args: unknown) => {
        const record = (args ?? {}) as Record<string, unknown>;
        const effort = String(record.effort ?? '');
        timeline.push(`start:${cmd}:${effort}`);
        if (effort === 'low') {
          await firstGate;
        }
        timeline.push(`end:${cmd}:${effort}`);
        return null;
      });

      globalThis.window = {
        __TAURI_INTERNALS__: { invoke },
        location: { protocol: 'tauri:' } as unknown as Location,
      } as unknown as Window & typeof globalThis;

      const p1 = invokeHost('remember_session_effort', {
        engine: 'omp',
        sessionId: 's1',
        effort: 'low',
      });
      const p2 = invokeHost('remember_session_effort', {
        engine: 'omp',
        sessionId: 's1',
        effort: 'max',
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(timeline).toEqual(['start:remember_session_effort:low']);

      releaseFirst();
      await Promise.all([p1, p2]);
      expect(timeline).toEqual([
        'start:remember_session_effort:low',
        'end:remember_session_effort:low',
        'start:remember_session_effort:max',
        'end:remember_session_effort:max',
      ]);
    });

    it('不同会话或只读命令不互相阻塞', async () => {
      const started: string[] = [];
      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      const invoke = vi.fn(async (cmd: string, args: unknown) => {
        const record = (args ?? {}) as Record<string, unknown>;
        const sessionId = typeof record.sessionId === 'string' ? record.sessionId : 'none';
        started.push(`${cmd}:${sessionId}`);
        if (sessionId === 's1') {
          await firstGate;
        }
        return {};
      });

      globalThis.window = {
        __TAURI_INTERNALS__: { invoke },
        location: { protocol: 'tauri:' } as unknown as Location,
      } as unknown as Window & typeof globalThis;

      const p1 = invokeHost('remember_session_model', {
        engine: 'omp',
        sessionId: 's1',
        model: 'm1',
      });
      const p2 = invokeHost('remember_session_model', {
        engine: 'omp',
        sessionId: 's2',
        model: 'm2',
      });
      const p3 = invokeHost('get_app_settings');

      await Promise.all([p2, p3]);
      expect(started).toContain('remember_session_model:s1');
      expect(started).toContain('remember_session_model:s2');
      expect(started).toContain('get_app_settings:none');

      releaseFirst();
      await p1;
    });

    it('enqueueSerial 前序任务抛错后不阻塞后续同 key 任务', async () => {
      const order: string[] = [];
      await expect(
        enqueueSerial('test-slot', async () => {
          order.push('first');
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const second = await enqueueSerial('test-slot', async () => {
        order.push('second');
        return 'ok';
      });
      expect(second).toBe('ok');
      expect(order).toEqual(['first', 'second']);
    });

    it('桌面 IPC 写入超时只让调用方失败，同 key 后续写入等到真实完成后才派发', async () => {
      vi.useFakeTimers();
      try {
        let finishHung!: () => void;
        const hungGate = new Promise<string>((resolve) => {
          finishHung = () => resolve('late');
        });
        const invoke = vi.fn((command: string) =>
          command === 'update_app_settings' && invoke.mock.calls.length === 1
            ? hungGate
            : Promise.resolve('ok'),
        );
        globalThis.window = {
          __TAURI_INTERNALS__: { invoke },
          location: { protocol: 'tauri:' } as unknown as Location,
        } as unknown as Window & typeof globalThis;

        const hung = invokeHost('update_app_settings', { settings: { a: 1 } });
        const hungResult = expect(hung).rejects.toThrow('update_app_settings 超时');

        await vi.advanceTimersByTimeAsync(120000);
        await hungResult;
        // 调用方超时后重试：旧写入仍在宿主执行，新写入不得抢先落盘后被旧写入覆盖。
        const next = invokeHost('update_app_settings', { settings: { a: 2 } });
        await vi.advanceTimersByTimeAsync(0);
        expect(invoke).toHaveBeenCalledTimes(1);

        finishHung();
        await expect(next).resolves.toBe('ok');
        expect(invoke).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
