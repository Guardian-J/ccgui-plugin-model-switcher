import type { CliEngineId } from "./types";

export interface HostSession {
  engine: string;
  sessionId: string | null;
  workspacePath: string;
  model?: string;
  effort?: string;
  provider?: string;
}

export function getHostSession(): HostSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem("ccgui-next.activeSession:v1");
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (value === null) return null;
    if (value && typeof value.engine === "string") return value;
  } catch { /* Invalid persisted sessions must not unlock engine switching. */ }
  return { engine: "unknown", sessionId: null, workspacePath: "" };
}

export function sessionSelectionError(
  engine: string,
  session: HostSession | null = getHostSession(),
  streaming = false,
): string | null {
  const locked = session && (session.engine === "unknown" || session.sessionId !== null || streaming);
  return locked && session.engine !== engine
    ? `当前会话属于 ${session.engine}，不能切换到 ${engine}`
    : null;
}

export function isConcreteModel(id: string): boolean {
  return !!id.trim() && id.trim().toLowerCase() !== "default";
}

export function modelSelectionError(
  _engine: CliEngineId,
  model: string,
  evidence?: ModelCompatibility,
): string | null {
  const id = model.trim().replace(/\[1m\]$/i, "");
  if (!isConcreteModel(id)) return "请选择具体模型";
  if (evidence?.authoritative && evidence.nativeIds) {
    const nativeSet = new Set(evidence.nativeIds);
    if (!nativeSet.has(id)) {
      return "该模型不在当前 CLI 的权威目录中";
    }
  }
  if (evidence?.modelProtocols?.length && evidence.engineProtocols?.length) {
    const engineProtocolSet = new Set(evidence.engineProtocols);
    if (!evidence.modelProtocols.some(protocol => engineProtocolSet.has(protocol))) {
      return "模型声明的协议与当前 CLI 不兼容";
    }
  }
  // Names and provider brands do not describe the protocol exposed by a relay.
  // Partial catalogs and missing metadata cannot prove incompatibility.
  return null;
}

export interface ModelCompatibility {
  nativeIds?: readonly string[];
  authoritative?: boolean;
  modelProtocols?: readonly string[];
  engineProtocols?: readonly string[];
}
