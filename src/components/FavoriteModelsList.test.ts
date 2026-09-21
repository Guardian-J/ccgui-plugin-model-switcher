import { describe, it, expect } from 'vitest';
import { isModelSelected } from './FavoriteModelsList';
import { pluginProviderId } from '../system-bridge';

describe('isModelSelected', () => {
  const plugin = { id: 'custom_1', isPlugin: true as const };
  const system = { id: 'grok', isPlugin: false as const };
  const prefixed = pluginProviderId('custom_1');

  it('插件渠道按 plugin_<id> 去前缀后匹配，不按渠道裸 id', () => {
    expect(isModelSelected('grok-4.6', `${prefixed}/grok-4.6`, plugin, 'omp')).toBe(true);
    expect(isModelSelected('grok-4.6', `${prefixed}/grok-4.6`, plugin, 'omp')).toBe(true);
  });

  it('插件渠道不把同名系统供应商的模型当成自己的选中项', () => {
    expect(isModelSelected('grok-4.6', 'grok/grok-4.6', plugin, 'omp')).toBe(false);
  });

  it('系统渠道按自身 id 去前缀匹配', () => {
    expect(isModelSelected('grok-4.6', 'grok/grok-4.6', system, 'omp')).toBe(true);
    expect(isModelSelected('grok-4.6', `${prefixed}/grok-4.6`, system, 'omp')).toBe(false);
  });

  it('裸模型 ID 在当前渠道下与归一化后的值相等才算选中', () => {
    expect(isModelSelected('grok-4.6', 'grok-4.6', plugin, 'omp')).toBe(true);
    expect(isModelSelected('grok-4.6', 'grok-4.6', system, 'omp')).toBe(true);
  });

  it('空选中项不算选中', () => {
    expect(isModelSelected('grok-4.6', '', plugin, 'omp')).toBe(false);
  });

  it('非 omp/pi 引擎不做供应商前缀处理', () => {
    expect(isModelSelected('claude-sonnet-4', 'claude-sonnet-4', plugin, 'claude')).toBe(true);
    expect(isModelSelected('claude-sonnet-4', `${prefixed}/claude-sonnet-4`, plugin, 'claude')).toBe(false);
  });
});
