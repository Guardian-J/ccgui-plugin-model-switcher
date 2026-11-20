import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearChannelContextOverrides,
  clearModelContextOverride,
  modelContextOverrideKey,
  readModelContextOverride,
  writeModelContextOverride,
} from "./model-context-override";
import { notifyCliConfigChanged } from "./system-bridge";

vi.mock("./system-bridge", () => ({
  notifyCliConfigChanged: vi.fn(),
}));

describe("model context overrides", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(notifyCliConfigChanged).mockReset();
  });

  it("uses the host's existing context memory key", () => {
    expect(modelContextOverrideKey("claude", "sonnet[1m]")).toBe(
      "ccgui.context-window.claude.sonnet[1m]",
    );
    expect(modelContextOverrideKey("omp", "provider/model")).toBe(
      "ccgui.context-window.omp.provider/model",
    );
  });

  it("reads and writes the localStorage fallback and refreshes the host catalog", async () => {
    await writeModelContextOverride("codex", "gpt-5.1", 1_048_576);
    await expect(readModelContextOverride("codex", "gpt-5.1")).resolves.toBe(1_048_576);
    expect(notifyCliConfigChanged).toHaveBeenCalledTimes(1);

    await clearModelContextOverride("codex", "gpt-5.1");
    await expect(readModelContextOverride("codex", "gpt-5.1")).resolves.toBeUndefined();
    expect(notifyCliConfigChanged).toHaveBeenCalledTimes(2);
  });

  it("ignores invalid persisted values", async () => {
    localStorage.setItem(modelContextOverrideKey("dsh", "model"), "0");
    await expect(readModelContextOverride("dsh", "model")).resolves.toBeUndefined();
  });

  it("clears all context overrides belonging to a deleted channel", async () => {
    await writeModelContextOverride("omp", "plugin_model-switcher_c1/m1", 1_000_000);
    await writeModelContextOverride("omp", "c1/m2", 500_000);
    await writeModelContextOverride("omp", "other/m1", 200_000);
    vi.mocked(notifyCliConfigChanged).mockReset();

    await clearChannelContextOverrides("omp", ["plugin_model-switcher_c1", "c1"]);

    await expect(readModelContextOverride("omp", "plugin_model-switcher_c1/m1")).resolves.toBeUndefined();
    await expect(readModelContextOverride("omp", "c1/m2")).resolves.toBeUndefined();
    await expect(readModelContextOverride("omp", "other/m1")).resolves.toBe(200_000);
    expect(notifyCliConfigChanged).toHaveBeenCalledTimes(1);
  });
});
