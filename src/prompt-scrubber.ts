import type { PluginContext } from "./ccgui-plugin";
import { invokeHost } from "./host-transport";
import scrubSource from "../scripts/scrub-core.cjs?raw";

export type ScrubStatus =
  | "clean"
  | "unscrubbed"
  | "not_found"
  | "checking"
  | "unknown";

interface ExecRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

interface ScrubPayload {
  status?: ScrubStatus;
  success?: boolean;
  message?: string;
  patchedCount?: number;
  restoredCount?: number;
  error?: string;
  files?: { path: string; status: string; rawMatches?: number; cleanMatches?: number; error?: string }[];
}

function parsePayload(stdout: string, stderr = ""): ScrubPayload {
  for (const stream of [stdout, stderr]) {
    for (const line of stream.trim().split(/\r?\n/).reverse()) {
      try {
        const payload = JSON.parse(line);
        if (
          payload &&
          typeof payload === "object" &&
          ("status" in payload || "success" in payload || "error" in payload)
        ) {
          return payload as ScrubPayload;
        }
      } catch {
        // Skip diagnostic lines; the script emits one JSON result.
      }
    }
  }
  throw new Error("清洗脚本未返回有效状态，请重新检测");
}

async function runScrub(
  ctx: PluginContext,
  action: "check" | "apply" | "restore",
): Promise<ScrubPayload> {
  const internals = typeof window !== "undefined" ? window.__TAURI_INTERNALS__ : undefined;
  if (!internals?.invoke) throw new Error("无法读取宿主 CLI 路径，请在桌面宿主中重试");
  const settings = await internals.invoke("get_app_settings") as { claudeBin?: string };
  const target = typeof settings?.claudeBin === "string" ? settings.claudeBin.trim() : "";
  const res = await invokeHost<ExecRunResult>(
    "plugin_exec_run",
    {
      bin: "node",
      args: ["-e", scrubSource, "--", action, ...(target ? [target] : [])],
      timeoutMs: 120000,
    },
  );

  const payload = parsePayload(res.stdout, res.stderr);
  if (payload.error) throw new Error(payload.error);
  if (res.code !== 0 || payload.success === false)
    throw new Error(payload.message || "清洗脚本执行失败");
  return payload;
}

function verifiedStatus(payload: ScrubPayload, expected: "clean" | "unscrubbed"): boolean {
  return payload.status === expected && Array.isArray(payload.files) && payload.files.length > 0 &&
    payload.files.every(file => !file.error && file.status === expected &&
      (expected === "clean" ? file.rawMatches === 0 && (file.cleanMatches ?? 0) > 0 :
        file.cleanMatches === 0 && (file.rawMatches ?? 0) > 0));
}

function asStatus(value: string | undefined): ScrubStatus {
  if (
    value === "clean" ||
    value === "unscrubbed" ||
    value === "not_found" ||
    value === "unknown"
  ) {
    return value;
  }
  return "unknown";
}

/** The host resolves Node and handles process visibility on each platform. */
export async function checkScrubStatus(
  ctx: PluginContext,
): Promise<{ status: ScrubStatus; message?: string }> {
  try {
    const payload = await runScrub(ctx, "check");
    const reported = asStatus(payload.status);
    const status = reported === "clean" ? verifiedStatus(payload, "clean") ? reported : "unknown"
      : reported === "unscrubbed" ? payload.files?.some(file => (file.rawMatches ?? 0) > 0) ? reported : "unknown" : reported;
    const message =
      status === "clean"
        ? "本地特征已替换。旧会话可能继续使用系统提示词快照，请用新会话验证；仅重启进程不一定刷新旧提示词"
        : status === "unscrubbed"
          ? "检测到未替换的 Agent SDK 特征句（包括 Claude agent 与旧版 CLI SDK 句式）"
          : status === "not_found"
            ? "未找到 Claude Code 安装文件"
            : payload.message || "当前 CLI 版本未识别到受支持的特征句，无法确认清洗状态";
    const files = payload.files?.map(file => file.path + (file.error ? ` (${file.error})` : "")).join("\n");
    return { status, message: files ? `${message}\n${files}` : message };
  } catch (err) {
    console.warn("[model-switcher] 检查提示词状态失败:", err);
    return { status: "unknown", message: String(err) };
  }
}

export async function applyScrubPrompt(
  ctx: PluginContext,
): Promise<{ success: boolean; message: string }> {
  try {
    const payload = await runScrub(ctx, "apply");
    if (payload.status === "not_found") {
      return { success: false, message: "未找到 Claude Code 安装文件" };
    }
    if (payload.success !== true || !verifiedStatus(payload, "clean")) {
      return { success: false, message: "无法确认清洗结果，请重新检测" };
    }
    return { success: true, message: "本地特征已替换并回读验证。请新建会话验证；恢复旧会话可能仍发送清洗前的提示词快照" };
  } catch (err) {
    return {
      success: false,
      message: `清洗失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function restoreOfficialPrompt(
  ctx: PluginContext,
): Promise<{ success: boolean; message: string }> {
  try {
    const payload = await runScrub(ctx, "restore");
    if ((payload.restoredCount || 0) === 0 && payload.status === "not_found") {
      return { success: false, message: "没有可恢复的备份或清洗痕迹" };
    }
    if (payload.success !== true || !verifiedStatus(payload, "unscrubbed")) {
      return { success: false, message: "无法确认恢复结果，请重新检测" };
    }
    return { success: true, message: "已恢复为官方默认特征" };
  } catch (err) {
    return {
      success: false,
      message: `恢复失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
