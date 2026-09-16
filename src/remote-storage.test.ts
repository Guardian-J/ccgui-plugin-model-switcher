import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRemoteStorage } from './remote-storage';
import type { PluginContext } from './ccgui-plugin';

vi.mock('./host-transport', () => ({
  isRemoteHost: vi.fn(() => false),
}));

describe('remote-storage', () => {
  let mockCtx: PluginContext;
  let mockLocalStorage: Map<string, string>;

  beforeEach(() => {
    mockCtx = {
      pluginId: 'test-plugin',
      storage: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
      },
    } as any;

    mockLocalStorage = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => mockLocalStorage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => mockLocalStorage.set(key, value)),
      removeItem: vi.fn((key: string) => mockLocalStorage.delete(key)),
      clear: vi.fn(() => mockLocalStorage.clear()),
      key: vi.fn((index: number) => Array.from(mockLocalStorage.keys())[index] ?? null),
      get length() { return mockLocalStorage.size; },
    };

    Object.defineProperty(window, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });

    vi.clearAllMocks();
  });

  it('应该在非远程模式下返回原始上下文', async () => {
    const { isRemoteHost } = await import('./host-transport');
    vi.mocked(isRemoteHost).mockReturnValue(false);

    const wrapped = withRemoteStorage(mockCtx);
    expect(wrapped).toBe(mockCtx);
  });

  it('应该在远程模式下返回包装的上下文', async () => {
    const { isRemoteHost } = await import('./host-transport');
    vi.mocked(isRemoteHost).mockReturnValue(true);

    const wrapped = withRemoteStorage(mockCtx);
    expect(wrapped).not.toBe(mockCtx);
    expect(wrapped.storage).not.toBe(mockCtx.storage);
  });

  it('应该优先从 localStorage 读取', async () => {
    const { isRemoteHost } = await import('./host-transport');
    vi.mocked(isRemoteHost).mockReturnValue(true);

    mockLocalStorage.set('ccgui.plugin.remote:test-plugin:key1', JSON.stringify({ value: 'local' }));
    vi.mocked(mockCtx.storage.get).mockResolvedValue({ value: 'remote' });

    const wrapped = withRemoteStorage(mockCtx);
    const result = await wrapped.storage.get('key1');

    expect(result).toEqual({ value: 'local' });
    expect(mockCtx.storage.get).not.toHaveBeenCalled();
  });

  it('应该在 localStorage 无数据时回退到远程', async () => {
    const { isRemoteHost } = await import('./host-transport');
    vi.mocked(isRemoteHost).mockReturnValue(true);

    vi.mocked(mockCtx.storage.get).mockResolvedValue({ value: 'remote' });

    const wrapped = withRemoteStorage(mockCtx);
    const result = await wrapped.storage.get('key1');

    expect(result).toEqual({ value: 'remote' });
    expect(mockCtx.storage.get).toHaveBeenCalledWith('key1');
  });

  it('应该在远程存储成功时清除 localStorage', async () => {
    const { isRemoteHost } = await import('./host-transport');
    vi.mocked(isRemoteHost).mockReturnValue(true);

    mockLocalStorage.set('ccgui.plugin.remote:test-plugin:key1', 'old-value');
    vi.mocked(mockCtx.storage.set).mockResolvedValue(undefined);

    const wrapped = withRemoteStorage(mockCtx);
    await wrapped.storage.set('key1', { value: 'new' });

    expect(mockCtx.storage.set).toHaveBeenCalledWith('key1', { value: 'new' });
    expect(mockLocalStorage.has('ccgui.plugin.remote:test-plugin:key1')).toBe(false);
  });

  it('应该在远程存储不支持时降级到 localStorage', async () => {
    const { isRemoteHost } = await import('./host-transport');
    vi.mocked(isRemoteHost).mockReturnValue(true);

    vi.mocked(mockCtx.storage.set).mockRejectedValue(new Error('unknown command: plugin_storage_set'));

    const wrapped = withRemoteStorage(mockCtx);
    await wrapped.storage.set('key1', { value: 'test' });

    expect(mockLocalStorage.get('ccgui.plugin.remote:test-plugin:key1')).toBe(JSON.stringify({ value: 'test' }));
  });

  it('应该在远程删除成功时清除 localStorage', async () => {
    const { isRemoteHost } = await import('./host-transport');
    vi.mocked(isRemoteHost).mockReturnValue(true);

    mockLocalStorage.set('ccgui.plugin.remote:test-plugin:key1', 'value');
    vi.mocked(mockCtx.storage.delete).mockResolvedValue(undefined);

    const wrapped = withRemoteStorage(mockCtx);
    await wrapped.storage.delete('key1');

    expect(mockCtx.storage.delete).toHaveBeenCalledWith('key1');
    expect(mockLocalStorage.has('ccgui.plugin.remote:test-plugin:key1')).toBe(false);
  });

  it('应该在远程删除不支持时写入 null 到 localStorage', async () => {
    const { isRemoteHost } = await import('./host-transport');
    vi.mocked(isRemoteHost).mockReturnValue(true);

    vi.mocked(mockCtx.storage.delete).mockRejectedValue(new Error('unknown command: plugin_storage_delete'));

    const wrapped = withRemoteStorage(mockCtx);
    await wrapped.storage.delete('key1');

    expect(mockLocalStorage.get('ccgui.plugin.remote:test-plugin:key1')).toBe('null');
  });
});

