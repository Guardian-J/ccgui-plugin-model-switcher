import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchModelsFromProvider } from './api';
import type { PluginContext } from './ccgui-plugin';

// Mock 模块
vi.mock('./host-transport', () => ({
  invokeHost: vi.fn(),
  isRemoteHost: vi.fn(() => false),
}));

vi.mock('./system-bridge', () => ({
  getNativeCatalog: vi.fn(),
}));

describe('api', () => {
  let mockCtx: PluginContext;

  beforeEach(() => {
    mockCtx = {
      pluginId: 'test-plugin',
      version: '1.0.0',
      storage: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      react: null as any,
      ui: null as any,
      theme: {} as any,
      i18n: {} as any,
      events: {} as any,
      bridge: {} as any,
      host: {} as any,
    };
    vi.clearAllMocks();
  });

  describe('fetchModelsFromProvider', () => {
    it('应该拒绝空 URL', async () => {
      await expect(
        fetchModelsFromProvider(mockCtx, '', 'sk-test')
      ).rejects.toThrow('请先填写供应商的基础 API 地址');
    });

    it('应该拒绝无协议的 URL', async () => {
      await expect(
        fetchModelsFromProvider(mockCtx, 'example.com', 'sk-test')
      ).rejects.toThrow('Base URL 必须以 http:// 或 https:// 开头');
    });

    it('应该拒绝非 HTTP/HTTPS 协议', async () => {
      await expect(
        fetchModelsFromProvider(mockCtx, 'ftp://example.com', 'sk-test')
      ).rejects.toThrow('Base URL 必须以 http:// 或 https:// 开头');

      await expect(
        fetchModelsFromProvider(mockCtx, 'file:///etc/passwd', 'sk-test')
      ).rejects.toThrow('Base URL 必须以 http:// 或 https:// 开头');
    });

    it('应该接受 http:// 协议', async () => {
      const { invokeHost } = await import('./host-transport');
      vi.mocked(invokeHost).mockResolvedValue({
        models: [{ id: 'model-1' }],
        endpoint: 'http://test.com/v1/models',
      });

      const result = await fetchModelsFromProvider(mockCtx, 'http://test.com/v1', 'sk-test');

      expect(result).toEqual(['model-1']);
    });

    it('应该接受 https:// 协议', async () => {
      const { invokeHost } = await import('./host-transport');
      vi.mocked(invokeHost).mockResolvedValue({
        models: [{ id: 'model-1' }],
        endpoint: 'https://test.com/v1/models',
      });

      const result = await fetchModelsFromProvider(mockCtx, 'https://test.com/v1', 'sk-test');

      expect(result).toEqual(['model-1']);
    });

    it('应该移除尾部斜杠', async () => {
      const { invokeHost } = await import('./host-transport');
      vi.mocked(invokeHost).mockResolvedValueOnce({
        data: [{ id: 'test-model' }],
        endpoint: 'https://test.com/v1/models',
      });

      const result = await fetchModelsFromProvider(mockCtx, 'https://test.com/v1///', 'sk-test');

      expect(result).toEqual(['test-model']);
      expect(invokeHost).toHaveBeenCalledWith(
        'fetch_provider_models',
        expect.objectContaining({
          baseUrl: 'https://test.com/v1',
        })
      );
    });

    it('应该忽略大小写（HTTP/HTTPS）', async () => {
      const { invokeHost } = await import('./host-transport');
      vi.mocked(invokeHost)
        .mockResolvedValueOnce({
          data: [{ id: 'model-1' }],
          endpoint: 'http://test.com/v1/models',
        })
        .mockResolvedValueOnce({
          data: [{ id: 'model-2' }],
          endpoint: 'https://test.com/v1/models',
        });

      await fetchModelsFromProvider(mockCtx, 'HTTP://test.com', 'sk-test');
      await fetchModelsFromProvider(mockCtx, 'HTTPS://test.com', 'sk-test');

      expect(invokeHost).toHaveBeenCalledTimes(2);
    });

    it('应该处理空模型列表', async () => {
      const { invokeHost } = await import('./host-transport');
      // 宿主返回空数组时会进入降级流程，需要 mock bridge
      vi.mocked(invokeHost).mockResolvedValueOnce({
        models: [],
        data: [],
      });

      mockCtx.bridge = {
        invoke: vi.fn().mockResolvedValue({
          status: 200,
          body: JSON.stringify({ data: [] }),
        }),
      } as any;

      const result = await fetchModelsFromProvider(mockCtx, 'https://test.com', 'sk-test');

      expect(result).toEqual([]);
    });

    it('应该过滤掉无效的模型（无 id）', async () => {
      const { invokeHost } = await import('./host-transport');
      vi.mocked(invokeHost).mockResolvedValueOnce({
        data: [
          { id: 'valid-model' },
          { name: 'invalid-no-id' },
          { id: '' },
          { id: 'another-valid' },
        ],
        endpoint: 'https://test.com/v1/models',
      });

      const result = await fetchModelsFromProvider(mockCtx, 'https://test.com', 'sk-test');

      expect(result).toEqual(['valid-model', 'another-valid']);
    });

    it('应该正确 trim API Key', async () => {
      const { invokeHost } = await import('./host-transport');
      vi.mocked(invokeHost).mockResolvedValueOnce({
        data: [{ id: 'test' }],
        endpoint: 'https://test.com/v1/models',
      });

      await fetchModelsFromProvider(mockCtx, 'https://test.com', '  sk-test  ');

      expect(invokeHost).toHaveBeenCalledWith(
        'fetch_provider_models',
        expect.objectContaining({
          apiKey: 'sk-test',
        })
      );
    });

    it('应该处理多级 URL 路径', async () => {
      const { invokeHost } = await import('./host-transport');
      vi.mocked(invokeHost).mockResolvedValueOnce({
        data: [{ id: 'test' }],
        endpoint: 'https://test.com/api/v2/models',
      });

      await fetchModelsFromProvider(mockCtx, 'https://test.com/api/v2/', 'sk-test');

      expect(invokeHost).toHaveBeenCalledWith(
        'fetch_provider_models',
        expect.objectContaining({
          baseUrl: 'https://test.com/api/v2',
        })
      );
    });
  });
});
