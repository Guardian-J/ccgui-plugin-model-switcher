import { describe, it, expect } from 'vitest';
import { parsePiFamilyProviders, upsertPiFamilyProviderText, removePiFamilyProviderText } from './pi-family-parser';

describe('pi-family-parser', () => {
  describe('parsePiFamilyProviders', () => {
    it('应该解析 JSON 格式的 providers', () => {
      const json = JSON.stringify({
        providers: {
          openai: {
            name: 'OpenAI',
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'sk-test',
            models: ['gpt-4', { id: 'gpt-3.5-turbo', name: 'GPT-3.5' }]
          }
        }
      });

      const result = parsePiFamilyProviders(json, 'json');

      expect(result).toHaveProperty('openai');
      expect(result.openai.name).toBe('OpenAI');
      expect(result.openai.baseUrl).toBe('https://api.openai.com/v1');
      expect(result.openai.models).toHaveLength(2);
      expect(result.openai.models[0]).toEqual({ id: 'gpt-4' });
      expect(result.openai.models[1]).toEqual({ id: 'gpt-3.5-turbo', name: 'GPT-3.5' });
    });

    it('应该处理 JSONC 注释', () => {
      const jsonc = `{
        // 这是注释
        "providers": {
          /* 多行
             注释 */
          "test": {
            "name": "Test",
            "baseUrl": "https://test.com"
          }
        }
      }`;

      const result = parsePiFamilyProviders(jsonc, 'json');

      expect(result).toHaveProperty('test');
      expect(result.test.name).toBe('Test');
    });

    it('应该解析 YAML 格式的 providers', () => {
      const yaml = `providers:
  anthropic:
    name: Anthropic
    baseUrl: https://api.anthropic.com
    apiKey: sk-ant-test
    api: anthropic-messages
    models:
      - id: claude-opus-5
        name: Claude Opus 5
      - id: claude-sonnet-5`;

      const result = parsePiFamilyProviders(yaml, 'yaml');

      expect(result).toHaveProperty('anthropic');
      expect(result.anthropic.name).toBe('Anthropic');
      expect(result.anthropic.baseUrl).toBe('https://api.anthropic.com');
      expect(result.anthropic.models).toHaveLength(2);
    });

    it('同名不同 YAML key 的供应商都按 id 保留', () => {
      const yaml = `providers:
  plugin_model-switcher_0b08bc2f-19ba-40b2-ba03-727dcac41fb2:
    name: "agv"
    baseUrl: "https://tobapi.fullcupai.com"
    api: anthropic-messages
    models:
      - id: "gemini-3.8-flash"
  0b08bc2f-19ba-40b2-ba03-727dcac41fb2:
    name: "agv"
    baseUrl: "https://tobapi.fullcupai.com"
    api: openai-completions
    models:
      - id: "gemini-3.8-flash"
  gemini:
    name: "gemini"
    baseUrl: "https://tobapi.fullcupai.com"
    api: openai-completions
    models:
      - id: "gemini-3.8-flash"`;

      const result = parsePiFamilyProviders(yaml, 'yaml');
      expect(Object.keys(result)).toEqual([
        'plugin_model-switcher_0b08bc2f-19ba-40b2-ba03-727dcac41fb2',
        '0b08bc2f-19ba-40b2-ba03-727dcac41fb2',
        'gemini',
      ]);
      expect(result['plugin_model-switcher_0b08bc2f-19ba-40b2-ba03-727dcac41fb2'].name).toBe('agv');
      expect(result['0b08bc2f-19ba-40b2-ba03-727dcac41fb2'].name).toBe('agv');
      expect(result.gemini.name).toBe('gemini');
    });

    it('应该返回空对象当输入为空', () => {
      expect(parsePiFamilyProviders('', 'json')).toEqual({});
      expect(parsePiFamilyProviders('   ', 'yaml')).toEqual({});
    });

    it('应该处理无效 JSON 并返回空对象', () => {
      const invalid = '{ invalid json }';
      const result = parsePiFamilyProviders(invalid, 'json');
      expect(result).toEqual({});
    });
  });

  describe('upsertPiFamilyProviderText', () => {
    it('应该在 JSON 中插入新 provider', () => {
      const initial = '{"providers":{}}';
      const patch = {
        name: 'Test Provider',
        baseUrl: 'https://test.com/v1',
        apiKey: 'sk-test-123',
        api: 'openai-completions' as const,
        models: [{ id: 'test-model' }]
      };

      const result = upsertPiFamilyProviderText(initial, 'json', 'test', patch);
      const parsed = JSON.parse(result);

      expect(parsed.providers).toHaveProperty('test');
      expect(parsed.providers.test.name).toBe('Test Provider');
      expect(parsed.providers.test.baseUrl).toBe('https://test.com/v1');
      expect(parsed.providers.test.auth).toBe('apiKey');
    });

    it('应该更新 JSON 中已存在的 provider', () => {
      const initial = JSON.stringify({
        providers: {
          test: {
            name: 'Old Name',
            baseUrl: 'https://old.com',
            apiKey: 'old-key',
            models: ['old-model']
          }
        }
      });

      const patch = {
        name: 'New Name',
        baseUrl: 'https://new.com',
        apiKey: 'new-key',
        api: 'openai-completions' as const,
        model: 'new-model'
      };

      const result = upsertPiFamilyProviderText(initial, 'json', 'test', patch);
      const parsed = JSON.parse(result);

      expect(parsed.providers.test.name).toBe('New Name');
      expect(parsed.providers.test.models[0].id).toBe('new-model');
      expect(parsed.providers.test.models[1].id).toBe('old-model');
    });

    it('应该在 YAML 中插入新 provider', () => {
      const initial = 'providers:\n';
      const patch = {
        name: 'Test',
        baseUrl: 'https://test.com',
        apiKey: 'sk-test',
        api: 'openai-completions' as const,
        models: ['model-1']
      };

      const result = upsertPiFamilyProviderText(initial, 'yaml', 'test', patch);

      expect(result).toContain('test:');
      expect(result).toContain('name: "Test"');
      expect(result).toContain('baseUrl: "https://test.com"');
      expect(result).toContain('auth: apiKey');
    });

    it('应该合并模型列表（新模型优先）', () => {
      const initial = JSON.stringify({
        providers: {
          test: {
            name: 'Test',
            baseUrl: 'https://test.com',
            apiKey: 'key',
            models: ['model-a', 'model-b']
          }
        }
      });

      const patch = {
        name: 'Test',
        baseUrl: 'https://test.com',
        apiKey: 'key',
        api: 'openai-completions' as const,
        models: ['model-c', 'model-a']
      };

      const result = upsertPiFamilyProviderText(initial, 'json', 'test', patch);
      const parsed = JSON.parse(result);

      expect(parsed.providers.test.models).toHaveLength(3);
      expect(parsed.providers.test.models[0].id).toBe('model-c');
      expect(parsed.providers.test.models[1].id).toBe('model-a');
      expect(parsed.providers.test.models[2].id).toBe('model-b');
    });
  });

  describe('removePiFamilyProviderText', () => {
    it('应该从 JSON 中删除 provider', () => {
      const initial = JSON.stringify({
        providers: {
          test1: { name: 'Test 1' },
          test2: { name: 'Test 2' }
        }
      });

      const result = removePiFamilyProviderText(initial, 'json', 'test1');
      const parsed = JSON.parse(result);

      expect(parsed.providers).not.toHaveProperty('test1');
      expect(parsed.providers).toHaveProperty('test2');
    });

    it('应该从 YAML 中删除 provider', () => {
      const initial = `providers:
  test1:
    name: Test 1
  test2:
    name: Test 2
`;

      const result = removePiFamilyProviderText(initial, 'yaml', 'test1');

      expect(result).not.toContain('test1:');
      expect(result).toContain('test2:');
    });

    it('应该处理删除最后一个 provider（YAML 转为空对象）', () => {
      const initial = `providers:
  only:
    name: Only Provider
`;

      const result = removePiFamilyProviderText(initial, 'yaml', 'only');

      expect(result).toContain('providers: {}');
    });

    it('应该返回原文本当 provider 不存在', () => {
      const initial = '{"providers":{"test":{}}}';
      const result = removePiFamilyProviderText(initial, 'json', 'nonexistent');

      // 解析后应该保持相同的结构（可能格式化了，但内容相同）
      expect(JSON.parse(result)).toEqual(JSON.parse(initial));
    });
  });
  describe('preserve reasoning and thinking attributes on models', () => {
    it('YAML upsert 应该保留模型上原有的 reasoning 与 contextWindow 属性', () => {
      const initialYaml = `providers:
  my-relay:
    name: My Relay
    baseUrl: https://api.relay.com/v1
    api: openai-completions
    auth: apiKey
    apiKey: secret
    models:
      - id: grok-4.6
        name: Grok 4.6
        reasoning: true
        contextWindow: 500000
`;
      const updated = upsertPiFamilyProviderText(initialYaml, 'yaml', 'my-relay', {
        name: 'My Relay',
        baseUrl: 'https://api.relay.com/v1',
        apiKey: 'secret',
        api: 'openai-completions',
        model: 'new-model',
      });

      expect(updated).toContain('id: "grok-4.6"');
      expect(updated).toContain('reasoning: true');
      expect(updated).toContain('contextWindow: 500000');
      expect(updated).toContain('id: "new-model"');
    });
    it('YAML upsert 应该自动修复被反斜杠转义的 thinking 属性并稳定保持为对象格式', () => {
      const initialYaml = `providers:
  my-provider:
    name: "claude"
    baseUrl: "https://api.example.com"
    api: anthropic-messages
    auth: apiKey
    apiKey: "sk-test"
    models:
      - id: "claude-sonnet-5-5"
        reasoning: true
        thinking: {"mode":"anthropic-adaptive","defaultLevel":"max","efforts":["low","medium","high","xhigh","max"]}
        contextWindow: 200000
      - id: "claude-opus-5-5"
        reasoning: true
        thinking: "{\\\\\\\\\\\\\\\"mode\\\\\\\\\\\\\\\":\\\\\\\\\\\\\\\"anthropic-adaptive\\\\\\\\\\\\\\\",\\\\\\\\\\\\\\\"defaultLevel\\\\\\\\\\\\\\\":\\\\\\\\\\\\\\\"max\\\\\\\\\\\\\\\",\\\\\\\\\\\\\\\"efforts\\\\\\\\\\\\\\\":[\\\\\\\\\\\\\\\"low\\\\\\\\\\\\\\\",\\\\\\\\\\\\\\\"medium\\\\\\\\\\\\\\\",\\\\\\\\\\\\\\\"high\\\\\\\\\\\\\\\",\\\\\\\\\\\\\\\"xhigh\\\\\\\\\\\\\\\",\\\\\\\\\\\\\\\"max\\\\\\\\\\\\\\\"]}"
        contextWindow: 200000
`;
      // 第一次 upsert：添加新模型或更新配置
      const updated1 = upsertPiFamilyProviderText(initialYaml, 'yaml', 'my-provider', {
        name: 'claude',
        baseUrl: 'https://api.example.com',
        apiKey: 'sk-test',
        api: 'anthropic-messages',
        model: 'claude-3-haiku',
      });

      // 不应包含任何反斜杠转义
      expect(updated1).not.toContain('\\\\\\');
      expect(updated1).toContain('thinking: {"mode":"anthropic-adaptive","defaultLevel":"max","efforts":["low","medium","high","xhigh","max"]}');

      // 第二次 upsert：模拟多次切换操作，确保幂等且不会产生反斜杠累加
      const updated2 = upsertPiFamilyProviderText(updated1, 'yaml', 'my-provider', {
        name: 'claude',
        baseUrl: 'https://api.example.com',
        apiKey: 'sk-test',
        api: 'anthropic-messages',
        model: 'claude-3-haiku',
      });

      expect(updated2).not.toContain('\\\\\\');
      expect(updated2).toBe(updated1);
    });

    it('YAML 解析应支持多行 thinking 块并正确还原', () => {
      const yamlWithMultiline = `providers:
  my-provider:
    name: "claude"
    baseUrl: "https://api.example.com"
    api: anthropic-messages
    auth: apiKey
    apiKey: "sk-test"
    models:
      - id: "claude-sonnet-5-5"
        reasoning: true
        thinking:
          mode: anthropic-adaptive
          defaultLevel: max
        contextWindow: 200000
`;
      const parsed = parsePiFamilyProviders(yamlWithMultiline, 'yaml');
      const model = parsed['my-provider']?.models[0];
      expect(model).toBeDefined();
      expect(typeof model?.thinking).toBe('object');
      expect((model?.thinking as any).mode).toBe('anthropic-adaptive');
      expect((model?.thinking as any).defaultLevel).toBe('max');
    });
  });
});
