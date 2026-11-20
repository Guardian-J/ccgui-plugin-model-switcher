import { notifyCliConfigChanged } from "./system-bridge";
import type { CliEngineId } from "./types";

/** Existing host cache key. Non-OMP/PI engines have no native window write
 *  path, so this is the display-only fallback, not a CLI runtime override. */
const CONTEXT_WINDOW_PREFIX = "ccgui.context-window";

export function modelContextOverrideKey(
  engine: CliEngineId,
  modelId: string,
): string {
  const engineId = engine.trim();
  const model = modelId.trim() || "default";
  return `${CONTEXT_WINDOW_PREFIX}.${engineId}.${model}`;
}

export async function readModelContextOverride(
  engine: CliEngineId,
  modelId: string,
): Promise<number | undefined> {
  try {
    const value = Number(localStorage.getItem(modelContextOverrideKey(engine, modelId)));
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function writeModelContextOverride(
  engine: CliEngineId,
  modelId: string,
  contextWindow: number,
): Promise<void> {
  localStorage.setItem(modelContextOverrideKey(engine, modelId), String(contextWindow));
  notifyCliConfigChanged();
}

export async function clearModelContextOverride(
  engine: CliEngineId,
  modelId: string,
): Promise<void> {
  localStorage.removeItem(modelContextOverrideKey(engine, modelId));
  notifyCliConfigChanged();
}

export async function clearChannelContextOverrides(
  engine: CliEngineId,
  providerIds: string[],
): Promise<void> {
  const engineId = engine.trim();
  const prefixes = Array.from(
    new Set(providerIds.map((id) => id.trim()).filter(Boolean)),
  ).map((id) => `${CONTEXT_WINDOW_PREFIX}.${engineId}.${id}/`);
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
