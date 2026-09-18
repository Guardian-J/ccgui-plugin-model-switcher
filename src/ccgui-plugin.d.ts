/**
 * @ccgui/plugin-sdk — 插件侧公共契约声明（VS Code 的 vscode.d.ts 同款模式：
 * 本文件是插件作者面对的公共 API 定义，与 src/ 同包维护、同版本发布；
 * 双向漂移由 src/contract-check.ts 在类型层面把守）。
 *
 * 插件仓用法（包未发布 npm 前的过渡方案）：复制本文件为插件仓的
 * `src/ccgui-plugin.d.ts`，首行版本戳必须与所用宿主 SDK 一致。
 *
 * @ccgui/plugin-sdk v0.3.10
 */

/** 宿主实现的 SDK 契约版本。 */
export const SDK_VERSION = "0.3.10";

export interface PluginManifest {
  name: string;
  displayName: string;
  version: string;
  description: string;
  author?: string;
  icon?: string;
  main: string;
  permissions?: Array<
    | "storage"
    | "ui:settings-section"
    | "ui:statusbar"
    | "ui:command"
    | "ui:session-menu"
    | "ui:composer-status"
    | "events"
    | "host:session"
    | "host:cli-config"
    | "host:workspace"
    | "host:workspace:remote"
  >;
  settings?: Array<{
    key: string;
    label: string;
    type: "string" | "number" | "boolean" | "select";
    default?: string | number | boolean;
    options?: Array<{ label: string; value: string | number }>;
    description?: string;
  }>;
}

export interface PluginContext {
  pluginId: string;
  manifest: PluginManifest;
  workspaceRoot: string | null;
  getSetting<T = unknown>(key: string): T | undefined;
  setSetting<T = unknown>(key: string, value: T): Promise<void>;
  ui: {
    /** 在设置页注册插件配置面板（权限 ui:settings-section）。 */
    registerSettingsSection(def: {
      key?: string;
      component: ComponentLike;
      label?: string | (() => string);
    }): Disposer;
    /** 状态栏 chip（权限 ui:statusbar）。 */
    registerStatusBarItem(def: {
      key?: string;
      component: ComponentLike;
      order?: number;
      /** 摆放区域（0.3.8 起）："start" = 左对齐区；缺省/"end" =
       *  同步状态之后、版本号之前的既有槽位。 */
      zone?: "start" | "end";
    }): Disposer;
    /** Composer 状态行条目（权限 ui:composer-status，0.3.9 起）：渲染在
     *  输入框状态行（分支/上下文用量那一行）左组、分支切换器之后。 */
    registerComposerStatusItem(def: {
      key?: string;
      component: ComponentLike;
      order?: number;
    }): Disposer;
    /** ⌘K 命令面板命令（权限 ui:command）。 */
    registerCommand(def: {
      key?: string;
      label: string | (() => string);
      icon?: string;
      category?: string | (() => string);
      run: () => void | Promise<void>;
      order?: number;
    }): Disposer;
    /** 侧栏会话右键菜单项（权限 ui:session-menu，0.3.5 起）。 */
    registerSessionMenuItem(def: {
      key?: string;
      label: string | (() => string);
      icon?: string;
      danger?: boolean;
      run: (session: { engine: string; sessionId: string }) => void | Promise<void>;
    }): Disposer;
    /** 跳转到本插件设置页（权限 ui:settings-section，0.3.6 起）。 */
    openSettings(key?: string): void;
  };
  storage: {
    /** 持久化存储（权限 storage）。 */
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
  };
  events: {
    /** 事件总线（权限 events）。宿主话题：`usage://updated`（引擎 usage
     *  事件透传，payload 为完整 EngineEventPayload `{ runId, sessionId,
     *  engine, seq, kind, data, ts? }`，data 是引擎原始 usage JSON）；
     *  `usage://done`（0.3.8 起，引擎 done 事件透传，data.usage 携带
     *  该轮最终用量——claude/grok 等只经 Done 上报用量的引擎由此对插件
     *  可见）；`session://activated`（0.3.8 起，活动会话切换，payload
     *  `{ engine, sessionId }`，pending 标签 sessionId 为 null，无活动
     *  标签时两者皆 null）；`composer://draft`（payload { text }，草稿
     *  变化/清空/会话切换均发射）。 */
    on(topic: string, cb: (data: unknown) => void): Disposer;
    emit(topic: string, data: unknown): void;
  };
  /** CLI 配置管理（权限 host:cli-config）。 */
  cli: {
    /** 读取原生配置。返回 CLI 的完整配置快照（cc-gui 的 config.json
     *  与各引擎的 ~/.config/<cli>/settings.json 合并视图）。 */
    getConfig(): Promise<CliConfig>;
    /** 注册独立供应商，写入 CLI 原生配置（claude/grok settings.json
     *  独立供应商段、OMP/PI models.yml/json 独立段）。 */
    upsertProvider(def: {
      engine: string;
      id: string;
      json: Record<string, unknown>;
    }): Promise<void>;
    /** 移除独立供应商。 */
    deleteProvider(def: { engine: string; id: string }): Promise<void>;
    /** 切换当前渠道（会写 CLI 原生配置）。 */
    setCurrentProvider(def: { engine: string; id: string }): Promise<void>;
  };
  /** 工作区管理（权限 host:workspace，0.3.3 起）。
   *  卸载时自动注销。 */
  workspaces: {
    /** 把任意路径登记为侧栏工作区，不要求本机存在该目录（支持远程机/WSL
     *  路径）。meta 透传存储，如 `{ wsl: { hostId, distro } }`（0.3.4 起
     *  携带 `wsl` 键需 `host:workspace:remote`）。 */
    add(path: string, meta?: Record<string, unknown>): Promise<void>;
  };
  /** 会话管理（权限 host:session，0.3.3 起）。
   *  卸载时自动注销。 */
  sessions: {
    selectSession(engine: string, sessionId: string, workspacePath: string): Promise<void>;
    /** 请求宿主立即刷新会话目录（侧栏/标签页），0.3.7 起。
     *  插件绕过宿主直写会话数据（如 sqlite custom_title、转录 title 行）后
     *  调用——否则变更要等用户手动同步或下次常规刷新才可见。 */
    refresh(): Promise<void>;
    /** 修改已有会话的 effort 档位，0.3.10 起。直写宿主会话状态并持久化
     *  （等价于用户在会话内切换档位，refreshSessions 不会回滚）。未知会话
     *  或空 effort 以 rejection 失败——不会创建幽灵会话条目。 */
    setEffort(engine: string, sessionId: string, workspacePath: string, effort: string): Promise<void>;
    registerSource(def: {
      /** 源 id,插件内唯一;同 id 重复登记覆盖(热重载语义)。 */
      id: string;
      /** 外部会话列表提供器;宿主在会话目录刷新时调用并把行合并进侧栏
       *  列表(本机扫描结果优先)。同步抛错的源被隔离(不连累其他源),
       *  返回数组受 500 行上限控制(不含本机会话)。 */
      list: () => ExternalSessionRow[] | Promise<ExternalSessionRow[]>;
    }): Disposer;
  };
}

export interface CliConfig {
  [engine: string]:
    | {
        providers?: Record<string, Record<string, unknown>>;
        current?: string;
      }
    | undefined;
}

export interface ExternalSessionRow {
  engine: string;
  sessionId: string;
  workspacePath: string;
  title?: string;
  lastModified?: number;
}

export interface EngineEventPayload {
  runId: string;
  sessionId: string;
  engine: string;
  seq: number;
  kind: string;
  data: Record<string, unknown>;
  /** 宿主发射时刻（Unix 毫秒），0.3.8 起。旧宿主上为 undefined。 */
  ts?: number;
}

export type ComponentLike =
  | ((props: Record<string, unknown>) => JSX.Element)
  | React.ComponentType<Record<string, unknown>>;

export type Disposer = () => void;

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: unknown;
    }
  }
}
