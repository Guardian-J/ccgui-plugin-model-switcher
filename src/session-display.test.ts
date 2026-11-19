import { beforeEach, describe, expect, it } from "vitest";
import { readSessionDisplay } from "./session-display";
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
