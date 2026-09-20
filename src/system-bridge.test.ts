import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  withoutCustomModel,
  displayEngineModel,
  CLI_DISPLAY_NAMES,
  independentChannelError,
  NATIVE_PROVIDER_ID,
  peekNativeCatalog,
  invalidateNativeCatalogCache,
  classifyProviderChannels,
  mergePluginChannelsById,
  pluginProviderId,
} from './system-bridge';
import type { SystemProviderChannel } from './types';

function ch(partial: Partial<SystemProviderChannel> & Pick<SystemProviderChannel, 'id' | 'name'>): SystemProviderChannel {
  return {
    baseUrl: '',
    apiKey: '',
    model: '',
    ...partial,
  };
}

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

    it('应该对所有引擎返回 null（4196fd3 起独立渠道限制已移除）', () => {
      expect(independentChannelError('dsh')).toBe(null);
      expect(independentChannelError('agy')).toBe(null);
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

  describe('classifyProviderChannels', () => {
    const native = ch({
      id: NATIVE_PROVIDER_ID,
      name: 'CLI 原生配置',
      isNative: true,
      remark: 'models.yml · agent.db',
    });
    const yamlHost = ch({
      id: 'google',
      name: 'Google',
      remark: 'models.yml · 3 个模型',
    });
    const yamlPlugin = ch({
      id: 'plugin_model-switcher_custom_1',
      name: '插件渠道',
      remark: 'models.yml · 1 个模型',
    });
    const hostProvider = ch({
      id: 'anthropic',
      name: 'Anthropic',
      remark: '系统供应商',
    });

    it('原生和宿主供应商进系统 tab，YAML 宿主进独立 tab', () => {
      const { systemChannels, independentSystemChannels, pluginYamlChannels } = classifyProviderChannels([
        native, hostProvider, yamlHost, yamlPlugin,
      ]);
      expect(systemChannels.map((c) => c.id)).toEqual([NATIVE_PROVIDER_ID, 'anthropic']);
      expect(independentSystemChannels.map((c) => c.id)).toEqual(['google']);
      expect(pluginYamlChannels.map((c) => c.id)).toEqual(['plugin_model-switcher_custom_1']);
    });

    it('带 plugin_ 前缀的 YAML 只进插件 YAML 列表', () => {
      const { systemChannels, independentSystemChannels, pluginYamlChannels } = classifyProviderChannels([yamlPlugin]);
      expect(systemChannels).toEqual([]);
      expect(independentSystemChannels).toEqual([]);
      expect(pluginYamlChannels).toEqual([yamlPlugin]);
    });

    it('同名不同 id 的 YAML 宿主全部保留', () => {
      const agvHost = ch({ id: '0b08bc2f-19ba-40b2-ba03-727dcac41fb2', name: 'agv', remark: 'models.yml · 1 个模型' });
      const geminiHost = ch({ id: 'gemini', name: 'gemini', remark: 'models.yml · 1 个模型' });
      const { independentSystemChannels } = classifyProviderChannels([agvHost, geminiHost]);
      expect(independentSystemChannels.map((c) => c.id)).toEqual([
        '0b08bc2f-19ba-40b2-ba03-727dcac41fb2',
        'gemini',
      ]);
    });

    it('原生 remark 含 models.yml 仍算系统渠道', () => {
      const { systemChannels, independentSystemChannels, pluginYamlChannels } = classifyProviderChannels([native]);
      expect(systemChannels).toEqual([native]);
      expect(independentSystemChannels).toEqual([]);
      expect(pluginYamlChannels).toEqual([]);
    });
  });

  describe('mergePluginChannelsById', () => {
    it('同名不同 id 的插件与宿主 YAML 都保留', () => {
      const stored = [{
        id: '0b08bc2f-19ba-40b2-ba03-727dcac41fb2',
        name: 'agv',
        baseUrl: 'https://tobapi.fullcupai.com',
        apiKey: 'sk-plugin',
      }];
      const yamlPlugin = ch({
        id: pluginProviderId('0b08bc2f-19ba-40b2-ba03-727dcac41fb2'),
        name: 'agv',
        remark: 'models.yml · 1 个模型',
      });
      const extraYaml = ch({
        id: pluginProviderId('other-plugin'),
        name: 'agv',
        remark: 'models.yml · 1 个模型',
      });
      const merged = mergePluginChannelsById(stored, [yamlPlugin, extraYaml]);
      expect(merged.map((c) => c.id)).toEqual([
        '0b08bc2f-19ba-40b2-ba03-727dcac41fb2',
        'other-plugin',
      ]);
    });
  });
});

