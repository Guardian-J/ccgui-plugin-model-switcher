import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  withoutCustomModel,
  displayEngineModel,
  CLI_DISPLAY_NAMES,
  independentChannelError,
  NATIVE_PROVIDER_ID,
  peekNativeCatalog,
  invalidateNativeCatalogCache
} from './system-bridge';

describe('system-bridge', () => {
  describe('CLI_DISPLAY_NAMES', () => {
    it('应该包含所有 CLI 的显示名称', () => {
      expect(CLI_DISPLAY_NAMES.claude).toBe('Claude Code');
      expect(CLI_DISPLAY_NAMES.pi).toBe('PI CLI');
      expect(CLI_DISPLAY_NAMES.omp).toBe('OMP CLI');
      expect(CLI_DISPLAY_NAMES.opencode).toBe('OpenCode');
      expect(CLI_DISPLAY_NAMES.qoder).toBe('Qoder CLI');
      expect(CLI_DISPLAY_NAMES['qoder-cn']).toBe('Qoder CLI CN');
    });
  });

  describe('NATIVE_PROVIDER_ID', () => {
    it('应该是固定的本地配置标识符', () => {
      expect(NATIVE_PROVIDER_ID).toBe('__local_settings_json__');
    });
  });

  describe('independentChannelError', () => {
    it('应该对支持的引擎返回 null', () => {
      expect(independentChannelError('claude')).toBe(null);
      expect(independentChannelError('codex')).toBe(null);
      expect(independentChannelError('pi')).toBe(null);
      expect(independentChannelError('omp')).toBe(null);
      expect(independentChannelError('opencode')).toBe(null);
      expect(independentChannelError('qoder')).toBe(null);
      expect(independentChannelError('qoder-cn')).toBe(null);
    });

    it('应该对不支持的引擎返回错误信息', () => {
      const error = independentChannelError('dsh');
      expect(error).toContain('DeepSeek Harness');
      expect(error).toContain('暂不支持独立渠道');
    });
  });

  describe('peekNativeCatalog', () => {
    it('应该在无缓存时返回 null', () => {
      expect(peekNativeCatalog('claude')).toBe(null);
    });
  });

  describe('invalidateNativeCatalogCache', () => {
    it('应该能清理特定引擎的缓存', () => {
      invalidateNativeCatalogCache('claude');
      expect(peekNativeCatalog('claude')).toBe(null);
    });

    it('应该能清理所有引擎的缓存', () => {
      invalidateNativeCatalogCache();
      expect(peekNativeCatalog('claude')).toBe(null);
      expect(peekNativeCatalog('pi')).toBe(null);
    });
  });

  describe('withoutCustomModel', () => {
    const mockChannel = { id: 'test-channel', isPlugin: false, isNative: false };

    it('应该从模型列表中移除指定的模型', () => {
      const models = ['gpt-4', 'gpt-3.5-turbo', 'claude-opus-5'];
      const result = withoutCustomModel('claude', mockChannel, models, 'gpt-4');

      expect(result).toEqual(['gpt-3.5-turbo', 'claude-opus-5']);
      expect(result).not.toContain('gpt-4');
    });

    it('应该处理空模型列表', () => {
      const result = withoutCustomModel('claude', mockChannel, [], 'gpt-4');
      expect(result).toEqual([]);
    });

    it('应该保留所有模型如果目标模型不存在', () => {
      const models = ['gpt-4', 'claude-opus-5'];
      const result = withoutCustomModel('claude', mockChannel, models, 'non-existent');

      expect(result).toEqual(models);
    });

    it('应该处理 custom/ 前缀的模型', () => {
      const models = ['custom/my-model', 'gpt-4'];
      const result = withoutCustomModel('claude', mockChannel, models, 'custom/my-model');

      expect(result).toEqual(['gpt-4']);
    });
  });

  describe('displayEngineModel', () => {
    it('应该移除 [1m] 后缀', () => {
      const result = displayEngineModel('claude', null, 'gpt-4[1m]');
      expect(result).toBe('gpt-4');
    });

    it('应该 trim 空格', () => {
      const result = displayEngineModel('claude', null, '  gpt-4  ');
      expect(result).toBe('gpt-4');
    });

    it('应该处理普通模型 ID', () => {
      const result = displayEngineModel('claude', null, 'claude-opus-5');
      expect(result).toBe('claude-opus-5');
    });
  });
});

