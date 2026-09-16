import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isRemoteHost } from './host-transport';

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
});
