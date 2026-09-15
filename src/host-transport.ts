interface TauriInternals {
  invoke?: (cmd: string, args?: unknown) => Promise<unknown>;
}

declare global {
  interface Window { __TAURI_INTERNALS__?: TauriInternals; }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let socket: WebSocket | null = null;
let connection: Promise<WebSocket> | null = null;
let disconnect: ((error: Error) => void) | null = null;
let nextId = 0;
const pending = new Map<number, PendingRequest>();

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
  const native = typeof window !== "undefined" ? window.__TAURI_INTERNALS__ : undefined;
  if (native?.invoke) return await Promise.resolve().then(() => native.invoke!(command, args)) as T;
  const ws = await connect();
  if (ws !== socket || ws.readyState !== WebSocket.OPEN) throw new Error("远程宿主连接已断开，请重试");
  const id = ++nextId;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("远程宿主请求超时，请检查连接后重试"));
    }, 120000);
    pending.set(id, { resolve: value => resolve(value as T), reject, timer });
    try { ws.send(JSON.stringify({ type: "invoke", id, cmd: command, args })); }
    catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error);
    }
  });
}

export function disposeHostTransport(): void {
  disconnect?.(new Error("插件已断开远程宿主连接"));
}
