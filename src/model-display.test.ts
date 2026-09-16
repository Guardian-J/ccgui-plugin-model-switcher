import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compactPluginModelLabel, installCompactModelLabels } from './model-display';

describe('model-display', () => {
  describe('compactPluginModelLabel', () => {
    it('应该保留普通模型 ID 不变', () => {
      expect(compactPluginModelLabel('gpt-4')).toBe('gpt-4');
      expect(compactPluginModelLabel('claude-opus-5')).toBe('claude-opus-5');
      expect(compactPluginModelLabel('gemini-pro')).toBe('gemini-pro');
    });

    it('应该移除 plugin_model-switcher_ 前缀', () => {
      expect(compactPluginModelLabel('plugin_model-switcher_openai/gpt-4')).toBe('gpt-4');
      expect(compactPluginModelLabel('plugin_model-switcher_anthropic/claude-opus-5')).toBe('claude-opus-5');
      expect(compactPluginModelLabel('plugin_model-switcher_test-provider/model-name')).toBe('model-name');
    });

    it('应该处理多个插件前缀', () => {
      const input = 'plugin_model-switcher_openai/gpt-4 and plugin_model-switcher_anthropic/claude';
      const expected = 'gpt-4 and claude';
      expect(compactPluginModelLabel(input)).toBe(expected);
    });

    it('应该处理空字符串', () => {
      expect(compactPluginModelLabel('')).toBe('');
    });

    it('应该保留不匹配的前缀', () => {
      expect(compactPluginModelLabel('openai/gpt-4')).toBe('openai/gpt-4');
      expect(compactPluginModelLabel('custom-prefix/model')).toBe('custom-prefix/model');
    });

    it('应该处理只有前缀无模型名的情况', () => {
      expect(compactPluginModelLabel('plugin_model-switcher_provider/')).toBe('');
    });

    it('应该处理下划线和连字符', () => {
      expect(compactPluginModelLabel('plugin_model-switcher_test_provider-123/model')).toBe('model');
    });

    it('应该处理包含 [1m] 后缀的模型', () => {
      expect(compactPluginModelLabel('gpt-4[1m]')).toBe('gpt-4[1m]');
      expect(compactPluginModelLabel('plugin_model-switcher_openai/gpt-4[1m]')).toBe('gpt-4[1m]');
    });

    it('应该处理带空格的模型 ID', () => {
      expect(compactPluginModelLabel('plugin_model-switcher_provider/model name')).toBe('model name');
    });

    it('应该处理中文字符', () => {
      // 正则表达式 [A-Za-z0-9_-]+ 不匹配中文，所以中文 provider ID 不会被移除
      expect(compactPluginModelLabel('plugin_model-switcher_提供商/模型名称')).toBe('plugin_model-switcher_提供商/模型名称');
      // 仅当 provider ID 是 ASCII 字符时才会被移除
      expect(compactPluginModelLabel('plugin_model-switcher_provider/模型名称')).toBe('模型名称');
    });

    it('应该处理大小写混合的前缀', () => {
      // 正则表达式区分大小写，只匹配精确的前缀格式
      expect(compactPluginModelLabel('Plugin_Model-Switcher_openai/gpt-4')).toBe('Plugin_Model-Switcher_openai/gpt-4');
      expect(compactPluginModelLabel('plugin_model-switcher_openai/gpt-4')).toBe('gpt-4');
    });

    it('应该处理前缀在句子中间的情况', () => {
      const input = 'Using plugin_model-switcher_openai/gpt-4 model';
      const expected = 'Using gpt-4 model';
      expect(compactPluginModelLabel(input)).toBe(expected);
    });
  });

  describe('installCompactModelLabels', () => {
    let container: HTMLElement;
    let dispose: () => void;

    beforeEach(() => {
      container = document.createElement('div');
      container.setAttribute('data-virtual-inner', '');
      document.body.appendChild(container);
    });

    afterEach(() => {
      dispose?.();
      container.remove();
    });

    it('应该压缩现有元素中的模型标签', () => {
      const metadata = document.createElement('span');
      metadata.className = 'text-caption-1-regular tabular-nums';
      const group = document.createElement('div');
      group.className = 'group';
      const flex = document.createElement('div');
      flex.className = 'mt-1 flex items-center gap-2';

      metadata.textContent = 'plugin_model-switcher_openai/gpt-4';
      flex.appendChild(metadata);
      group.appendChild(flex);
      container.appendChild(group);

      dispose = installCompactModelLabels();

      expect(metadata.textContent).toBe('gpt-4');
    });

    it('应该在 dispose 时恢复原始值', () => {
      const metadata = document.createElement('span');
      metadata.className = 'text-caption-1-regular tabular-nums';
      const group = document.createElement('div');
      group.className = 'group';
      const flex = document.createElement('div');
      flex.className = 'mt-1 flex items-center gap-2';

      metadata.textContent = 'plugin_model-switcher_openai/gpt-4';
      flex.appendChild(metadata);
      group.appendChild(flex);
      container.appendChild(group);

      dispose = installCompactModelLabels();
      expect(metadata.textContent).toBe('gpt-4');

      dispose();
      expect(metadata.textContent).toBe('plugin_model-switcher_openai/gpt-4');
    });
  });
});
