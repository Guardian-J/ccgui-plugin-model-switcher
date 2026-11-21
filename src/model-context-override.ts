import { notifyCliConfigChanged } from "./system-bridge";
import type { CliEngineId } from "./types";

/** Existing host cache key (may be overwritten by host's rememberContextWindow). */
const CONTEXT_WINDOW_PREFIX = "ccgui.context-window";
/** Plugin-owned explicit override key: never overwritten by host turn-end reports. */
const EXPLICIT_OVERRIDE_PREFIX = "ccgui.model-switcher.context-window-override";

export function modelContextOverrideKey(
  engine: CliEngineId,
  modelId: string,
): string {
  const engineId = engine.trim();
  const model = modelId.trim() || "default";
  return `${CONTEXT_WINDOW_PREFIX}.${engineId}.${model}`;
}

export function explicitModelContextOverrideKey(
  engine: CliEngineId,
  modelId: string,
): string {
  const engineId = engine.trim();
  const model = modelId.trim() || "default";
  return `${EXPLICIT_OVERRIDE_PREFIX}.${engineId}.${model}`;
}

function readPositiveWindow(key: string): number | undefined {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export function readExplicitModelContextOverrideSync(
  engine: string,
  modelId: string,
): number | undefined {
  if (typeof localStorage === "undefined" || !engine.trim() || !modelId.trim()) return undefined;
  return readPositiveWindow(`${EXPLICIT_OVERRIDE_PREFIX}.${engine.trim()}.${modelId.trim()}`);
}

export async function readModelContextOverride(
  engine: CliEngineId,
  modelId: string,
): Promise<number | undefined> {
  return (
    readPositiveWindow(explicitModelContextOverrideKey(engine, modelId)) ??
    readPositiveWindow(modelContextOverrideKey(engine, modelId))
  );
}

export async function writeModelContextOverride(
  engine: CliEngineId,
  modelId: string,
  contextWindow: number,
): Promise<void> {
  const value = String(contextWindow);
  localStorage.setItem(explicitModelContextOverrideKey(engine, modelId), value);
  localStorage.setItem(modelContextOverrideKey(engine, modelId), value);
  notifyCliConfigChanged();
}

export async function clearModelContextOverride(
  engine: CliEngineId,
  modelId: string,
): Promise<void> {
  localStorage.removeItem(explicitModelContextOverrideKey(engine, modelId));
  localStorage.removeItem(modelContextOverrideKey(engine, modelId));
  notifyCliConfigChanged();
}

export async function clearChannelContextOverrides(
  engine: CliEngineId,
  providerIds: string[],
): Promise<void> {
  const engineId = engine.trim();
  const ids = Array.from(new Set(providerIds.map((id) => id.trim()).filter(Boolean)));
  const prefixes = ids.flatMap((id) => [
    `${CONTEXT_WINDOW_PREFIX}.${engineId}.${id}/`,
    `${EXPLICIT_OVERRIDE_PREFIX}.${engineId}.${id}/`,
  ]);
  if (!engineId || prefixes.length === 0) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }
    if (keysToRemove.length === 0) return;
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    notifyCliConfigChanged();
  } catch {
    // ignore localStorage access failures
  }
}
