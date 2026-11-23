import { beforeEach, describe, expect, it } from "vitest";
import { readSessionDisplay, resolveSessionRecovery, withSessionDisplay } from "./session-display";
import { DEFAULT_STATE } from "./constants";
import type { CustomPluginChannel } from "./types";
import { isModelRequiredBlocked } from "./send-guard";
import type { HostCliMenuProps } from "./sync-host";

const ACTIVE_KEY = "ccgui-next.activeSession:v1";

function setActiveSession(session: {
  engine: string;
  sessionId: string | null;
  workspacePath: string;
  model?: string;
}): void {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(session));
}

function makeHost(models: Record<string, string>): HostCliMenuProps {
  return {
    value: "claude",
    models,
    onChange: () => {},
    onModelChange: () => {},
  };
}

function readWithHost(host: HostCliMenuProps) {
  // triggerButton: null → 不扫 Fiber；host 参数模拟宿主 CliMenu 的 props。
  return readSessionDisplay(null, { triggerButton: null, host });
}

beforeEach(() => {
  localStorage.clear();
});

describe("readSessionDisplay 模型解析与发送守卫", () => {
  it("新会话没有页签覆盖时认引擎默认模型，不再误判为未选择", () => {
    setActiveSession({ engine: "claude", sessionId: null, workspacePath: "/ws" });
    // 插件选定模型后必有 store.models / defaultModels[engine]，宿主发送也用它兜底。
    const display = readWithHost(makeHost({ claude: "claude-sonnet-4-5" }));
    expect(display?.selectedModel).toBe("claude-sonnet-4-5");
    expect(display && isModelRequiredBlocked(display, display.selectedModel)).toBe(false);
  });

  it("新会话完全未选择模型时仍拦截发送", () => {
    setActiveSession({ engine: "claude", sessionId: null, workspacePath: "/ws" });
    const display = readWithHost(makeHost({}));
    expect(display?.selectedModel).toBe("");
    expect(display && isModelRequiredBlocked(display, display.selectedModel)).toBe(true);
  });

  it("default 占位符不算已选模型", () => {
    setActiveSession({ engine: "claude", sessionId: null, workspacePath: "/ws" });
    const display = readWithHost(makeHost({ claude: "default" }));
    expect(display?.selectedModel).toBe("");
    expect(display && isModelRequiredBlocked(display, display.selectedModel)).toBe(true);
  });

  it("没有活动页签时不把引擎默认模型当作已选", () => {
    // localStorage 无 activeSession：宿主连新会话页签都还没建。
    const display = readWithHost(makeHost({ claude: "claude-sonnet-4-5" }));
    expect(display?.selectedModel).toBe("");
    expect(display && isModelRequiredBlocked(display, display.selectedModel)).toBe(true);
  });

  it("页签显式选择优先于引擎默认模型", () => {
    setActiveSession({
      engine: "claude",
      sessionId: null,
      workspacePath: "/ws",
      model: "claude-opus-4-1",
    });
    const display = readWithHost(makeHost({ claude: "claude-sonnet-4-5" }));
    expect(display?.selectedModel).toBe("claude-opus-4-1");
    expect(display && isModelRequiredBlocked(display, display.selectedModel)).toBe(false);
  });
});

describe("withSessionDisplay 按默认模型前缀恢复渠道", () => {
  const channels: CustomPluginChannel[] = [
    { id: "wrong", name: "Wrong", baseUrl: "https://wrong.example", apiKey: "" },
    { id: "right", name: "Right", baseUrl: "https://right.example", apiKey: "" },
  ];
  const state = {
    ...DEFAULT_STATE,
    selectedCli: "omp" as const,
    selectedModel: "wrong-model",
    selectedProviderId: "plugin_model-switcher_wrong",
    activeChannelType: "plugin" as const,
    activePluginChannelId: "wrong",
    pluginChannels: { omp: channels },
    sessionChannels: {
      other: {
        selectedCli: "omp" as const,
        selectedProviderId: "plugin_model-switcher_wrong",
        selectedModel: "wrong-model",
        effort: "high" as const,
        enable1MContext: false,
        activeChannelType: "plugin" as const,
        activePluginChannelId: "wrong",
      },
    },
  };
  const display = {
    sessionKey: '["omp",null,"/ws",false]',
    stableKey: '["omp",null,"/ws"]',
    workspacePath: "/ws",
    sessionId: null,
    selectedCli: "omp" as const,
    selectedModel: "plugin_model-switcher_right/gpt-4o",
    effort: "high" as const,
    enable1MContext: false,
    selectedProviderId: "",
  };

  it("默认模型属于另一插件渠道时选中模型自己的渠道", () => {
    const next = withSessionDisplay(state, display);
    expect(next.activeChannelType).toBe("plugin");
    expect(next.activePluginChannelId).toBe("right");
    expect(next.selectedProviderId).toBe("plugin_model-switcher_right");
  });

  it("模型名自带斜杠但不匹配插件前缀时不改变渠道", () => {
    const next = withSessionDisplay(state, {
      ...display,
      selectedModel: "openrouter/anthropic/claude-sonnet",
    });
    expect(next.activeChannelType).toBe("system");
    expect(next.activePluginChannelId).toBeUndefined();
    expect(next.selectedProviderId).toBe("");
  });

  it("已有会话的权威 provider 优先于模型前缀", () => {
    const next = withSessionDisplay(state, {
      ...display,
      sessionId: "s1",
      stableKey: '["omp","s1","/ws"]',
      selectedProviderId: "plugin_model-switcher_wrong",
    });
    expect(next.activeChannelType).toBe("plugin");
    expect(next.activePluginChannelId).toBe("wrong");
    expect(next.selectedProviderId).toBe("plugin_model-switcher_wrong");
  });

  it("系统 provider 不被模型名中的斜杠覆盖", () => {
    const next = withSessionDisplay(state, {
      ...display,
      selectedModel: "system-relay/gpt-4o",
      selectedProviderId: "actual-system",
    });
    expect(next.activeChannelType).toBe("system");
    expect(next.activePluginChannelId).toBeUndefined();
    expect(next.selectedProviderId).toBe("actual-system");
  });

  it("普通斜杠模型不被猜成系统渠道", () => {
    const next = withSessionDisplay(state, {
      ...display,
      selectedModel: "system-relay/gpt-4o",
    });
    expect(next.activeChannelType).toBe("system");
    expect(next.activePluginChannelId).toBeUndefined();
    expect(next.selectedProviderId).toBe("");
  });
});

describe("resolveSessionRecovery 会话切换恢复边界", () => {
  it("首次新会话刚拿到 sessionId 且尚无 sessionChannels 记录时不触发恢复（避免空 model 清空当前模型）", () => {
    const display = {
      sessionKey: '["omp","s1","/ws",true]',
      stableKey: '["omp","s1","/ws"]',
      workspacePath: "/ws",
      sessionId: "s1",
      selectedCli: "omp" as const,
      selectedModel: "plugin_model-switcher_c1/kimi-k3.1-pro",
      effort: "max" as const,
      enable1MContext: true,
      selectedProviderId: "plugin_model-switcher_c1",
    };
    const savedState = {
      ...DEFAULT_STATE,
      selectedCli: "omp" as const,
      effort: "max" as const,
      sessionChannels: {},
    };
    expect(resolveSessionRecovery(display, savedState)).toBeNull();
  });

  it("已有记录中 selectedModel 为空时不传空字符串覆盖模型，仅按需恢复渠道与档位", () => {
    const display = {
      sessionKey: '["omp","s2","/ws",false]',
      stableKey: '["omp","s2","/ws"]',
      workspacePath: "/ws",
      sessionId: "s2",
      selectedCli: "omp" as const,
      selectedModel: "plugin_model-switcher_c1/kimi-k3.1-pro",
      effort: "high" as const,
      enable1MContext: false,
      selectedProviderId: "plugin_model-switcher_c1",
    };
    const savedState = {
      ...DEFAULT_STATE,
      sessionChannels: {
        '["omp","s2","/ws"]': {
          selectedCli: "omp" as const,
          selectedProviderId: "plugin_model-switcher_c1",
          selectedModel: "",
          effort: "max" as const,
          enable1MContext: false,
          activeChannelType: "plugin" as const,
          activePluginChannelId: "c1",
        },
      },
    };
    const plan = resolveSessionRecovery(display, savedState);
    expect(plan).not.toBeNull();
    expect(plan?.hostModel).toBeUndefined();
    expect(plan?.effort).toBe("max");
  });

  it("已有记录与当前会话完全一致时跳过冗余恢复", () => {
    const display = {
      sessionKey: '["omp","s3","/ws",false]',
      stableKey: '["omp","s3","/ws"]',
      workspacePath: "/ws",
      sessionId: "s3",
      selectedCli: "omp" as const,
      selectedModel: "plugin_model-switcher_c1/kimi-k3.1-pro",
      effort: "max" as const,
      enable1MContext: true,
      selectedProviderId: "plugin_model-switcher_c1",
    };
    const savedState = {
      ...DEFAULT_STATE,
      pluginChannels: {
        omp: [{ id: "c1", name: "C1", baseUrl: "https://api.example", apiKey: "k" }],
      },
      sessionChannels: {
        '["omp","s3","/ws"]': {
          selectedCli: "omp" as const,
          selectedProviderId: "plugin_model-switcher_c1",
          selectedModel: "kimi-k3.1-pro",
          effort: "max" as const,
          enable1MContext: true,
          activeChannelType: "plugin" as const,
          activePluginChannelId: "c1",
        },
      },
    };
    expect(resolveSessionRecovery(display, savedState)).toBeNull();
  });
});
