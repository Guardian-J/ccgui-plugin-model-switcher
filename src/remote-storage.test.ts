import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRemoteStorage } from './remote-storage';
import { isRemoteHost } from './host-transport';
import type { PluginContext } from './ccgui-plugin';

vi.mock('./host-transport', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    isRemoteHost: vi.fn(() => false),
  };
});

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

  it('应该在非远程模式下包装 storage 并串行化同 key 并发写入', async () => {
    vi.mocked(isRemoteHost).mockReturnValue(false);

    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    vi.mocked(mockCtx.storage.set).mockImplementation(async (_key, value: unknown) => {
      const step = Number((value as Record<string, unknown>).step);
      events.push(`start:${step}`);
      if (step === 1) {
        await firstGate;
      }
      events.push(`end:${step}`);
    });
    const wrapped = withRemoteStorage(mockCtx);
    const p1 = wrapped.storage.set('state', { step: 1 });
    const p2 = wrapped.storage.set('state', { step: 2 });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(['start:1']);

    releaseFirst();
    await Promise.all([p1, p2]);
    expect(events).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
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

  it('应该让写入之后发起的读取等到写入完成再读', async () => {
    vi.mocked(isRemoteHost).mockReturnValue(false);

    let stored: unknown = { step: 0 };
    let releaseSet!: () => void;
    const setGate = new Promise<void>((resolve) => {
      releaseSet = resolve;
    });
    vi.mocked(mockCtx.storage.set).mockImplementation(async (_key, value: unknown) => {
      await setGate;
      stored = value;
    });
    vi.mocked(mockCtx.storage.get).mockImplementation(async () => stored as never);

    const wrapped = withRemoteStorage(mockCtx);
    const write = wrapped.storage.set('state', { step: 1 });
    const read = wrapped.storage.get('state');

    await Promise.resolve();
    await Promise.resolve();
    expect(mockCtx.storage.get).not.toHaveBeenCalled();

    releaseSet();
    await write;
    await expect(read).resolves.toEqual({ step: 1 });
  });

  it('应该在远程读取 localStorage 抛 SecurityError 时回退 ctx.storage', async () => {
    vi.mocked(isRemoteHost).mockReturnValue(true);

    // 模拟浏览器跨域 iframe 中 localStorage 访问被禁用的场景。
    vi.mocked(window.localStorage.getItem).mockImplementation(() => {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    });
    vi.mocked(mockCtx.storage.get).mockResolvedValue({ value: 'remote' });

    const wrapped = withRemoteStorage(mockCtx);
    await expect(wrapped.storage.get('key1')).resolves.toEqual({ value: 'remote' });
    expect(mockCtx.storage.get).toHaveBeenCalledWith('key1');
  });

  it('应该在本地缓存损坏时清理并回退远程', async () => {
    vi.mocked(isRemoteHost).mockReturnValue(true);

    mockLocalStorage.set('ccgui.plugin.remote:test-plugin:key1', '{broken json');
    vi.mocked(mockCtx.storage.get).mockResolvedValue({ value: 'remote' });

    const wrapped = withRemoteStorage(mockCtx);
    await expect(wrapped.storage.get('key1')).resolves.toEqual({ value: 'remote' });

    expect(mockLocalStorage.has('ccgui.plugin.remote:test-plugin:key1')).toBe(false);
    expect(mockCtx.storage.get).toHaveBeenCalledWith('key1');
  });

  it('应该在远程写入成功但缓存清理异常时不失败', async () => {
    vi.mocked(isRemoteHost).mockReturnValue(true);

    vi.mocked(mockCtx.storage.set).mockResolvedValue(undefined);
    vi.mocked(window.localStorage.removeItem).mockImplementation(() => {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    });

    const wrapped = withRemoteStorage(mockCtx);
    await expect(wrapped.storage.set('key1', { value: 'new' })).resolves.toBeUndefined();
    expect(mockCtx.storage.set).toHaveBeenCalledWith('key1', { value: 'new' });
  });

  it('应该在远程删除成功但缓存清理异常时不失败', async () => {
    vi.mocked(isRemoteHost).mockReturnValue(true);

    vi.mocked(mockCtx.storage.delete).mockResolvedValue(undefined);
    vi.mocked(window.localStorage.removeItem).mockImplementation(() => {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    });

    const wrapped = withRemoteStorage(mockCtx);
    await expect(wrapped.storage.delete('key1')).resolves.toBeUndefined();
    expect(mockCtx.storage.delete).toHaveBeenCalledWith('key1');
  });

  it('应该在旧宿主不支持远程存储且本地写入失败时抛出', async () => {
    vi.mocked(isRemoteHost).mockReturnValue(true);

    const failure = new DOMException('Access is denied for this document.', 'SecurityError');
    vi.mocked(mockCtx.storage.set).mockRejectedValue(new Error('unknown command: plugin_storage_set'));
    vi.mocked(window.localStorage.setItem).mockImplementation(() => {
      throw failure;
    });

    const wrapped = withRemoteStorage(mockCtx);
    await expect(wrapped.storage.set('key1', { value: 'test' })).rejects.toBe(failure);
    expect(mockLocalStorage.has('ccgui.plugin.remote:test-plugin:key1')).toBe(false);
  });

  it('应该在旧宿主不支持远程删除且本地写入失败时抛出', async () => {
    vi.mocked(isRemoteHost).mockReturnValue(true);

    const failure = new DOMException('Access is denied for this document.', 'SecurityError');
    vi.mocked(mockCtx.storage.delete).mockRejectedValue(new Error('unknown command: plugin_storage_delete'));
    vi.mocked(window.localStorage.setItem).mockImplementation(() => {
      throw failure;
    });

    const wrapped = withRemoteStorage(mockCtx);
    await expect(wrapped.storage.delete('key1')).rejects.toBe(failure);
  });
});

