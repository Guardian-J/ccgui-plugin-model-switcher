interface TauriInternals {
  invoke?: (cmd: string, args?: unknown) => Promise<unknown>;
}

declare global {
  interface Window { __TAURI_INTERNALS__?: TauriInternals; }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

let socket: WebSocket | null = null;
let connection: Promise<WebSocket> | null = null;
let disconnect: ((error: Error) => void) | null = null;
let nextId = 0;
const pending = new Map<number, PendingRequest>();
const persistenceTails = new Map<string, Promise<unknown>>();

/**
 * Async Tauri / WebSocket commands may finish out of call order on multi-worker
 * blocking pools. Chain writes that target the same logical key so an earlier
 * slower write never overwrites a newer selection.
 */
export function enqueueSerial<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = persistenceTails.get(key) ?? Promise.resolve();
  const result = previous.then(task, task);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  persistenceTails.set(key, settled);
  void settled.then(() => {
    if (persistenceTails.get(key) === settled) {
      persistenceTails.delete(key);
    }
  });
  return result;
}

function persistenceSlotKey(command: string, args: Record<string, unknown>): string | null {
  const engine = typeof args.engine === "string" ? args.engine : "";
  const sessionId = typeof args.sessionId === "string" ? args.sessionId : "";
  switch (command) {
    case "remember_session_model":
    case "remember_session_effort":
    case "remember_session_provider":
      return `${command}:${engine}:${sessionId}`;
    case "update_app_settings":
      return "app_settings";
    case "set_current_provider":
    case "upsert_provider":
    case "delete_provider":
      return `cli_config:${engine}`;
    case "pi_family_models_config_write":
      return `pi_family_models:${engine}`;
    case "plugin_storage_set":
    case "plugin_storage_delete": {
      const id = typeof args.id === "string" ? args.id : "";
      const key = typeof args.key === "string" ? args.key : "";
      return `plugin_kv:${id}:${key}`;
    }
    default:
      return null;
  }
}

const HOST_REQUEST_TIMEOUT_MS = 120000;

/**
 * Bounds how long a caller waits for a serialized write. The timeout only fails
 * the caller: the queue slot stays held until the host actually answers, so a
 * late-finishing write can never land after (and overwrite) a newer one.
 */
function withCallerTimeout<T>(command: string, promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`宿主命令 ${command} 超时，请重试`)), HOST_REQUEST_TIMEOUT_MS);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * `requestTimeout: false` keeps a remote request pending until its response or
 * a disconnect, so the serial queue reflects when the host really finished.
 */
async function invokeHostRaw<T>(
  command: string,
  args: Record<string, unknown> = {},
  { requestTimeout = true }: { requestTimeout?: boolean } = {},
): Promise<T> {
  const native = typeof window !== "undefined" ? window.__TAURI_INTERNALS__ : undefined;
  if (native?.invoke) return await Promise.resolve().then(() => native.invoke!(command, args)) as T;
  const ws = await connect();
  if (ws !== socket || ws.readyState !== WebSocket.OPEN) throw new Error("远程宿主连接已断开，请重试");
  const id = ++nextId;
  return new Promise<T>((resolve, reject) => {
    const timer = requestTimeout
      ? setTimeout(() => {
        pending.delete(id);
        reject(new Error("远程宿主请求超时，请检查连接后重试"));
      }, HOST_REQUEST_TIMEOUT_MS)
      : undefined;
    pending.set(id, { resolve: value => resolve(value as T), reject, timer });
    try { ws.send(JSON.stringify({ type: "invoke", id, cmd: command, args })); }
    catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error);
    }
  });
}
export function isRemoteHost(): boolean {
  return typeof window !== "undefined" && !window.__TAURI_INTERNALS__?.invoke &&
    /^https?:$/.test(window.location?.protocol || "");
}

function connect(): Promise<WebSocket> {
  if (connection) return connection;
  if (!isRemoteHost()) return Promise.reject(new Error("无法连接宿主，请在 CC GUI 或其远程访问页面中使用插件"));
  // Same endpoint and authentication as the host's src/lib/transport.ts.
  // Cookie-authenticated pages need no token; URL tokens remain on this origin.
  const url = new URL("/ws", window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const token = new URL(window.location.href).searchParams.get("token");
  if (token) url.searchParams.set("token", token);
  const ws = new WebSocket(url);
  socket = ws;
  ws.binaryType = "arraybuffer";
  connection = new Promise((resolve, reject) => {
    const fail = (error: Error) => {
      clearTimeout(connectTimer);
      reject(error);
      if (socket !== ws) return;
      socket = null;
      connection = null;
      disconnect = null;
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(error);
      }
      pending.clear();
      ws.close();
    };
    disconnect = fail;
    const connectTimer = setTimeout(() => fail(new Error("连接远程宿主超时，请检查远程访问连接")), 10000);
    ws.onopen = () => { clearTimeout(connectTimer); resolve(ws); };
    ws.onclose = () => fail(new Error("远程宿主连接已断开，请重新操作以连接"));
    ws.onerror = () => fail(new Error("无法连接远程宿主，请检查远程访问是否已登录"));
    ws.onmessage = event => {
      let message;
      try {
        message = JSON.parse(typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data));
      } catch { return; }
      if (message?.type !== "response") return;
      const entry = pending.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(message.id);
      if (message.ok === true) entry.resolve(message.payload);
      else {
        const error = String(message.error || "远程宿主请求失败");
        entry.reject(new Error(/unknown command:\s*pi_family_models_config_(read|write)\b/.test(error)
          ? "当前宿主远程访问未开放 OMP/PI 配置管理，请在桌面端配置该渠道和模型" : error));
      }
    };
  });
  return connection;
}

/** Use desktop IPC or the authenticated remote bridge; never read the client machine's CLI files. */
export async function invokeHost<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const slotKey = persistenceSlotKey(command, args);
  if (!slotKey) {
    return invokeHostRaw<T>(command, args);
  }
  return withCallerTimeout(command, enqueueSerial(slotKey, () => invokeHostRaw<T>(command, args, { requestTimeout: false })));
}

export function disposeHostTransport(): void {
  disconnect?.(new Error("插件已断开远程宿主连接"));
}
