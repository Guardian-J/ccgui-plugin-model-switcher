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
  mergeYamlProviderIntoHostChannel,
  mergePluginChannelsById,
  withoutPluginTwinChannels,
  pluginProviderId,
  updatePiFamilyModelEffort,
  getSystemProviderChannels,
  parseNativeOfficialFields,
} from './system-bridge';
import { invokeHost } from './host-transport';

vi.mock('./host-transport', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    invokeHost: vi.fn(async () => ({})),
    isRemoteHost: vi.fn(() => false),
  };
});
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

  describe('parseNativeOfficialFields codebuddy', () => {
    const file = (content: unknown) => [{ path: 'C:\\u\\.codebuddy\\settings.json', format: 'json', exists: true, content: JSON.stringify(content) }];

    it('读取 env 中的 URL / Key，顶层 model 优先于 CODEBUDDY_MODEL', () => {
      expect(parseNativeOfficialFields('codebuddy', file({
        model: 'glm-5',
        env: { CODEBUDDY_BASE_URL: 'https://copilot.tencent.com/v1', CODEBUDDY_API_KEY: 'sk-cb', CODEBUDDY_MODEL: 'deepseek-v4' },
      }) as never)).toEqual({ baseUrl: 'https://copilot.tencent.com/v1', apiKey: 'sk-cb', model: 'glm-5' });
    });

    it('无顶层 model 时回退 env.CODEBUDDY_MODEL', () => {
      expect(parseNativeOfficialFields('codebuddy', file({ model: '  ', env: { CODEBUDDY_MODEL: 'deepseek-v4' } }) as never).model)
        .toBe('deepseek-v4');
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

    it('原生和宿主供应商进系统 tab，YAML 宿主单独返回（供去重后并入系统 tab）', () => {
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

    it('宿主已登记的 id 被 YAML 补模型后仍算系统渠道', () => {
      const hostRegistered = ch({ id: 'kimi-cn', name: 'Kimi 国内', remark: '系统供应商' });
      const fromYaml = ch({
        id: 'kimi-cn',
        name: 'kimi-cn',
        remark: 'models.yml · 2 个模型',
        isNative: false,
        settingsConfig: { models: [{ id: 'k2' }] },
      });
      const merged = mergeYamlProviderIntoHostChannel(hostRegistered, fromYaml);
      expect(merged.remark).toBe('系统供应商');
      expect(merged.name).toBe('Kimi 国内');
      expect((merged.settingsConfig as { models?: unknown[] }).models).toEqual([{ id: 'k2' }]);
      const { systemChannels, independentSystemChannels } = classifyProviderChannels([merged]);
      expect(systemChannels.map((c) => c.id)).toEqual(['kimi-cn']);
      expect(independentSystemChannels).toEqual([]);
    });

    it('原生 remark 含 models.yml 仍算系统渠道', () => {
      const { systemChannels, independentSystemChannels, pluginYamlChannels } = classifyProviderChannels([native]);
      expect(systemChannels).toEqual([native]);
      expect(independentSystemChannels).toEqual([]);
      expect(pluginYamlChannels).toEqual([]);
    });
  });

  describe('withoutPluginTwinChannels', () => {
    const grokYaml = ch({ id: 'custom_1', name: 'grok', baseUrl: 'https://tobapi.fullcupai.com' });
    const pluginGrok = { id: 'custom_1', name: 'grok', baseUrl: 'https://tobapi.fullcupai.com/' };

    it('同 id 的裸 key 宿主行被插件行吸收，不再重复显示', () => {
      expect(withoutPluginTwinChannels([grokYaml], [pluginGrok])).toEqual([]);
    });

    it('插件行带 plugin_ 前缀时同样能匹配裸 key 宿主行', () => {
      expect(withoutPluginTwinChannels([grokYaml], [{ id: pluginProviderId('custom_1') }])).toEqual([]);
    });

    it('真·宿主 YAML 渠道无插件孪生时保留', () => {
      const google = ch({ id: 'google', name: 'Google', baseUrl: 'https://generativelanguage.googleapis.com' });
      expect(withoutPluginTwinChannels([google, grokYaml], [pluginGrok])).toEqual([google]);
    });

    it('同名不同 id 是不同渠道，全部保留', () => {
      const sameName = ch({ id: 'grok', name: 'grok', baseUrl: 'https://tobapi.fullcupai.com' });
      expect(withoutPluginTwinChannels([sameName], [pluginGrok])).toEqual([sameName]);
    });

    it('同名同址但 id 不同也不去重', () => {
      const twinAddr = ch({ id: 'grok-2', name: 'grok', baseUrl: 'https://tobapi.fullcupai.com/' });
      expect(withoutPluginTwinChannels([twinAddr], [pluginGrok])).toEqual([twinAddr]);
    });

    it('插件孪生条目即使等于 keepId 也必须剔除，仅非孪生条目可受 keepId 保护', () => {
      expect(withoutPluginTwinChannels([grokYaml], [pluginGrok], 'custom_1')).toEqual([]);
      expect(withoutPluginTwinChannels([grokYaml], [pluginGrok], pluginProviderId('custom_1'))).toEqual([]);
      const realHost = ch({ id: 'google', name: 'Google' });
      expect(withoutPluginTwinChannels([realHost, grokYaml], [pluginGrok], 'google')).toEqual([realHost]);
    });
    it('插件渠道缺 id 时不判定为重复', () => {
      expect(withoutPluginTwinChannels([grokYaml], [{ id: '' }])).toEqual([grokYaml]);
    });

    it('无插件渠道时原样返回', () => {
      expect(withoutPluginTwinChannels([grokYaml], [])).toEqual([grokYaml]);
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

  describe('getSystemProviderChannels OMP/PI 空壳与孤儿过滤', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('过滤掉 OMP config.json 中的 { name: id } 空壳占位条目与裸 custom_<timestamp> 孤儿条目', async () => {
      vi.mocked(invokeHost).mockImplementation(async (cmd) => {
        if (cmd === 'get_cli_config') {
          return {
            omp: {
              providers: {
                custom_1792114533998: { name: 'custom_1792114533998' },
                custom_1792387731129: { name: 'custom_1792387731129' },
                'plugin_model-switcher_custom_1792114533998': {
                  name: 'sup',
                  baseUrl: 'https://api.example.com',
                  apiKey: 'sk-sup',
                },
                'real-host-provider': {
                  name: 'Real Host',
                  baseUrl: 'https://host.example.com',
                  apiKey: 'sk-host',
                },
              },
              current: 'plugin_model-switcher_custom_1792114533998',
            },
          };
        }
        if (cmd === 'pi_family_models_config_read') {
          return {
            text: `providers:\n  plugin_model-switcher_custom_1792114533998:\n    name: "sup"\n    baseUrl: "https://api.example.com"\n    api: openai-completions\n    models:\n      - id: "gpt-4o"\n`,
            file: { format: 'yaml' },
          };
        }
        if (cmd === 'pi_family_auth_list') {
          return { providers: [{ id: 'google', state: 'configured', keySource: 'stored', maskedKey: 'AIza***' }] };
        }
        return {};
      });

      const res = await getSystemProviderChannels('omp');
      expect(res.current).toBe('plugin_model-switcher_custom_1792114533998');
      const ids = res.channels.map((c) => c.id);
      expect(ids).not.toContain('custom_1792114533998');
      expect(ids).not.toContain('custom_1792387731129');
      expect(ids).toContain('real-host-provider');
      expect(ids).toContain('google');
      expect(ids).toContain('plugin_model-switcher_custom_1792114533998');
    });
  });
});

  describe('updatePiFamilyModelEffort Ultra 模式适配', () => {
    it('当 effort 为 ultra 时，写入 YAML 的 defaultLevel 应适配为 max', async () => {
      const initialYaml = `providers:\n  test-provider:\n    name: "test"\n    baseUrl: "https://api.test.com"\n    api: anthropic-messages\n    models:\n      - id: "gemini-3.8-flash"\n`;
      let writtenText = '';
      vi.mocked(invokeHost).mockImplementation(async (cmd, args: any) => {
        if (cmd === 'pi_family_models_config_read') {
          return { text: initialYaml, file: { format: 'yaml' } };
        }
        if (cmd === 'pi_family_models_config_write') {
          writtenText = args?.text || '';
          return {};
        }
        return {};
      });

      await updatePiFamilyModelEffort(
        'omp',
        { id: 'test-provider', name: 'test', baseUrl: 'https://api.test.com' },
        'gemini-3.8-flash',
        'ultra',
        true,
      );

      expect(writtenText).toContain('"defaultLevel":"max"');
      expect(writtenText).not.toContain('"defaultLevel":"ultra"');
      expect(writtenText).toContain('contextWindow: 1048576');
    });

    it('当 effort 为 medium 时，写入 YAML 的 defaultLevel 为 medium', async () => {
      const initialYaml = `providers:\n  test-provider:\n    name: "test"\n    baseUrl: "https://api.test.com"\n    api: anthropic-messages\n    models:\n      - id: "gemini-3.8-flash"\n`;
      let writtenText = '';
      vi.mocked(invokeHost).mockImplementation(async (cmd, args: any) => {
        if (cmd === 'pi_family_models_config_read') {
          return { text: initialYaml, file: { format: 'yaml' } };
        }
        if (cmd === 'pi_family_models_config_write') {
          writtenText = args?.text || '';
          return {};
        }
        return {};
      });

      await updatePiFamilyModelEffort(
        'omp',
        { id: 'test-provider', name: 'test', baseUrl: 'https://api.test.com' },
        'gemini-3.8-flash',
        'medium',
      );

      expect(writtenText).toContain('"defaultLevel":"medium"');
    });

    it('并发调用 updatePiFamilyModelEffort 时按序读取-修改-写入，后一次不会用过期 YAML 覆盖前一次修改', async () => {
      let currentYaml = `providers:\n  test-provider:\n    name: "test"\n    baseUrl: "https://api.test.com"\n    api: anthropic-messages\n    models:\n      - id: "m1"\n      - id: "m2"\n`;
      let releaseFirstRead!: () => void;
      const firstReadGate = new Promise<void>((resolve) => {
        releaseFirstRead = resolve;
      });
      let readCount = 0;

      vi.mocked(invokeHost).mockImplementation(async (cmd, args?: Record<string, unknown>) => {
        if (cmd === 'pi_family_models_config_read') {
          readCount += 1;
          const snapshot = currentYaml;
          if (readCount === 1) {
            await firstReadGate;
          }
          return { text: snapshot, file: { format: 'yaml' } };
        }
        if (cmd === 'pi_family_models_config_write') {
          currentYaml = String(args?.text ?? '');
          return {};
        }
        return {};
      });

      const channel = { id: 'test-provider', name: 'test', baseUrl: 'https://api.test.com' };
      const p1 = updatePiFamilyModelEffort('omp', channel, 'm1', 'low');
      const p2 = updatePiFamilyModelEffort('omp', channel, 'm2', 'ultra');

      await Promise.resolve();
      await Promise.resolve();
      releaseFirstRead();
      await Promise.all([p1, p2]);

      expect(currentYaml).toContain('"defaultLevel":"low"');
      expect(currentYaml).toContain('"defaultLevel":"max"');
    });
  });
