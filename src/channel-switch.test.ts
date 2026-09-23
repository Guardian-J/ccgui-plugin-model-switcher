import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PluginContext } from './ccgui-plugin';

// 宿主 set_current_provider 会拒绝未注册的渠道 ID（config.rs:285-291
// "provider {id} not found"），因此独立渠道必须先 upsert_provider 注册，
// 否则切换静默失败。本测试守护该注册步骤不被再次跳过。
vi.mock('./host-transport', () => ({
  invokeHost: vi.fn(async () => undefined),
  isRemoteHost: vi.fn(() => false),
}));

describe('独立渠道切换', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应用独立渠道时必须向宿主注册 upsert_provider', async () => {
    const { invokeHost } = await import('./host-transport');
    const { applyCustomPluginChannelToEngine, pluginProviderId } = await import('./system-bridge');

    const channel = {
      id: 'test-channel',
      name: '测试渠道',
      baseUrl: 'https://example.com',
      apiKey: 'sk-test',
    };

    await applyCustomPluginChannelToEngine({} as PluginContext, 'claude', channel);

    const upsert = vi.mocked(invokeHost).mock.calls
      .find(([cmd]) => cmd === 'upsert_provider');

    expect(upsert, 'upsert_provider 未被调用，渠道切换会因未注册而失败').toBeDefined();
    expect(upsert?.[1]).toMatchObject({
      engine: 'claude',
      id: pluginProviderId(channel.id),
    });
  }, 15000);
});
