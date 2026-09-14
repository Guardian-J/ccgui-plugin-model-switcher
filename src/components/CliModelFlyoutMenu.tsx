import { React, useState, useEffect, useMemo, useRef } from "../react-context";
import type { PluginContext } from "../ccgui-plugin";
import type {
  CliEngineId,
  PluginState,
  SystemProviderChannel,
  CustomPluginChannel,
  EffortLevel,
} from "../types";
import {
  getSystemEngines,
  peekSystemEngines,
  optimisticSystemEngines,
  getSystemProviderChannels,
  isPluginProviderId,
  setSystemCurrentProvider,
  applyCustomPluginChannelToEngine,
  deleteCustomPluginChannel,
  peekNativeCatalog,
  getNativeCatalog,
  invalidateNativeCatalogCache,
  type EngineItemRule,
  NATIVE_PROVIDER_ID,
  channelModelKey,
  type NativeModel,
  CLI_ENGINES_CHANGED_EVENT,
  CLI_CONFIG_CHANGED_EVENT,
} from "../system-bridge";
import { fetchModelsFromProvider, loadNativeChannelModels } from "../api";
import {
  ProjectEngineIcon,
  SearchIcon,
  RefreshIcon,
  CheckIcon,
  PaletteIcon,
  PlusIcon,
  TrashIcon,
  EyeIcon,
  EyeOffIcon,
  inferModelEngine,
} from "../icons";
import { EffortSection } from "./EffortSection";
import { flyoutStyles } from "./flyout-styles";
import { ThemeSettingsPanel } from "./ThemeSettingsPanel";
import type { GuiThemeManager } from "../theme-manager";
import { applyModelSelectionToHost, hostSessionSelectionError as sessionSelectionError } from "../sync-host";
import { useSessionDisplay, withSessionDisplay } from "../session-display";
import { getHostSession, modelSelectionError, isConcreteModel } from "../selection-policy";
import {
  checkScrubStatus,
  applyScrubPrompt,
  restoreOfficialPrompt,
  type ScrubStatus,
} from "../prompt-scrubber";

const ROW = "ms-row";
const ROW_ON = "is-selected";
const ROW_OFF = "";
const ICON_BTN = "ms-icon-button";
const FIELD = "ms-field";

interface Props {
  ctx: PluginContext;
  state: PluginState;
  themeManager?: GuiThemeManager;
  triggerRef?: { current: HTMLElement | null };
  onSave: (newState: PluginState) => Promise<void>;
  onClose: () => void;
}

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/**
 * API Key 输入/只读展示，默认掩码，点击眼睛图标切换明文。
 * @param readOnly 系统渠道查看时只允许显示，不允许修改
 */
function SecretInput({
  value,
  onChange,
  placeholder,
  readOnly,
}: {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="ms-secret-field">
      <input
        type={visible ? "text" : "password"}
        value={value}
        readOnly={readOnly}
        onChange={
          readOnly || !onChange
            ? undefined
            : (e) => onChange(e.target.value)
        }
        placeholder={placeholder}
        autoComplete="off"
        className={FIELD}
      />
      <button
        type="button"
        className={`${ICON_BTN} ms-secret-toggle`}
        aria-label={visible ? "隐藏 API Key" : "查看 API Key"}
        title={visible ? "隐藏" : "查看"}
        aria-pressed={visible}
        onClick={() => setVisible((prev) => !prev)}
      >
        {visible ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
      </button>
    </span>
  );
}

function ChannelRow({
  name,
  url,
  detail,
  brand,
  selected,
  onSelect,
  onDelete,
  onEdit,
  onView,
  disabled,
}: {
  name: string;
  url?: string;
  detail?: string;
  brand: string;
  selected: boolean;
  onSelect: () => void;
  onDelete?: (e: React.MouseEvent) => void;
  onEdit?: (e: React.MouseEvent) => void;
  onView?: (e: React.MouseEvent) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`ms-channel-row ${selected ? ROW_ON : ROW_OFF}`}>
      <button
        type="button"
        className={ROW}
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={selected}
        title={url || detail ? `${name}\n${url || detail}` : name}
      >
        <ProjectEngineIcon engine={brand} size={18} />
        <span className="ms-row-copy">
          <span className="ms-row-title">{name}</span>
          {url || detail ? (
            <span className="ms-row-detail">
              {url ? url.replace(/^https?:\/\//, "") : detail}
            </span>
          ) : null}
        </span>
        {selected ? <CheckIcon size={16} className="ms-check" /> : null}
      </button>
      {onView ? (
        <button
          type="button"
          aria-label="查看渠道"
          title="查看系统渠道"
          onClick={onView}
          disabled={disabled}
          className={`${ICON_BTN} ms-view-channel`}
        >
          <EyeIcon size={13} />
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          aria-label="删除渠道"
          title="删除该插件独立渠道"
          onClick={onDelete}
          disabled={disabled}
          className={`${ICON_BTN} ms-delete`}
        >
          <TrashIcon size={13} />
        </button>
      ) : null}
      {onEdit ? <button type="button" aria-label="编辑渠道" title="编辑渠道" onClick={onEdit} disabled={disabled} className={`${ICON_BTN} ms-edit-channel`}>✎</button> : null}
    </div>
  );
}

export function CliModelFlyoutMenu({
  ctx,
  state: initialState,
  themeManager,
  triggerRef,
  onSave,
  onClose,
}: Props) {
  const sessionDisplay = useSessionDisplay(triggerRef);
  const [state, setState] = useState<PluginState>(() => withSessionDisplay(initialState, sessionDisplay));
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [engines, setEngines] = useState<EngineItemRule[]>(
    () => peekSystemEngines() ?? optimisticSystemEngines(state.selectedCli),
  );
  const [activeEngine, setActiveEngine] = useState<CliEngineId>(
    state.selectedCli,
  );
  const [channels, setChannels] = useState<SystemProviderChannel[]>([]);
  const initialCachedCatalog = peekNativeCatalog(state.selectedCli);
  const [nativeModels, setNativeModels] = useState<NativeModel[]>(
    () => initialCachedCatalog?.models ?? [],
  );
  const [nativeAuthoritative, setNativeAuthoritative] = useState(
    () => initialCachedCatalog?.authoritative ?? false,
  );
  const channelRequest = useRef(0);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [switching, setSwitching] = useState(false);
  const selectionPending = useRef(false);
  const modelRequest = useRef(0);
  const legacyEngine = useRef(initialState.selectedCli);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [pendingDeleteModel, setPendingDeleteModel] = useState<string | null>(null);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [channelForm, setChannelForm] = useState({
    name: "",
    baseUrl: "",
    apiKey: "",
    model: "",
  });
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [viewingChannelId, setViewingChannelId] = useState<string | null>(null);
  const [menuLayout, setMenuLayout] = useState<{
    offsetX: number;
    maxHeight: number;
    below: boolean;
  }>({
    offsetX: 0,
    maxHeight: 560,
    below: false,
  });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const busy = switching;

  useEffect(() => {
    if (!sessionDisplay) return;
    if (sessionDisplay.selectedCli !== activeEngine) {
      modelRequest.current++;
      setFetchingModels(false);
      setLoadingChannels(true);
      setActiveEngine(sessionDisplay.selectedCli);
    }
    setState(prev => withSessionDisplay(prev, sessionDisplay));
  }, [sessionDisplay]);

  useEffect(() => {
    const updatePosition = () => {
      const triggerEl = triggerRef?.current;
      const totalWidth = Math.min(760, window.innerWidth - 24);
      if (!triggerEl) {
        setMenuLayout({
          offsetX: 0,
          maxHeight: window.innerHeight - 24,
          below: false,
        });
        return;
      }
      const rect = triggerEl.getBoundingClientRect();
      const spaceAbove = rect.top - 20;
      const spaceBelow = window.innerHeight - rect.bottom - 20;
      const below = spaceAbove < 400 && spaceBelow > spaceAbove;
      const preferredHeight = window.innerWidth <= 600 ? 680 : 560;
      const availableHeight = Math.max(
        0,
        Math.min(preferredHeight, below ? spaceBelow : spaceAbove),
      );
      const left = Math.max(
        12,
        Math.min(rect.left, window.innerWidth - totalWidth - 12),
      );
      setMenuLayout({
        offsetX: left - rect.left,
        maxHeight: availableHeight,
        below,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        triggerRef?.current?.focus();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [triggerRef, onClose]);

  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applyEngines = (res: EngineItemRule[]) => {
      if (cancelled || !res || res.length === 0) return;
      setEngines(res);
      if (!getHostSession() && res.length > 0 && !res.some((e) => e.id === activeEngine)) {
        const firstAvailable = res.find((e) => e.available) || res[0];
        setActiveEngine(firstAvailable.id);
        setState((prev) => ({ ...prev, selectedCli: firstAvailable.id }));
      }
    };

    // 1. 快速读取（命中缓存时首帧返回，未命中时异步读取）
    void getSystemEngines(false).then(applyEngines);

    // 2. SWR 后台即时探活：弹窗打开时静默重新探测 PATH 与版本，感知最新安装/升级变动
    void getSystemEngines(true).then(applyEngines);

    // 3. 监听全局 CLI 状态与配置变动事件
    const handleEnginesChanged = (e: Event) => {
      const customEvent = e as CustomEvent<EngineItemRule[]>;
      if (customEvent.detail) {
        applyEngines(customEvent.detail);
      } else {
        void getSystemEngines(true).then(applyEngines);
      }
    };

    const handleConfigChanged = () => {
      void loadChannels(activeEngine);
    };

    const handleWindowFocus = () => {
      void getSystemEngines(true).then(applyEngines);
    };

    window.addEventListener(CLI_ENGINES_CHANGED_EVENT, handleEnginesChanged);
    window.addEventListener(CLI_CONFIG_CHANGED_EVENT, handleConfigChanged);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      cancelled = true;
      window.removeEventListener(CLI_ENGINES_CHANGED_EVENT, handleEnginesChanged);
      window.removeEventListener(CLI_CONFIG_CHANGED_EVENT, handleConfigChanged);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  const loadChannels = async (engine: CliEngineId) => {
    const request = ++channelRequest.current;
    setLoadingChannels(true);
    setChannels([]);
    setCurrentChannelId(null);
    setStatusMsg(null);
    try {
      const res = await getSystemProviderChannels(engine);
      if (request !== channelRequest.current) return;
      setChannels(res.channels);
      setCurrentChannelId(res.current);
      setState((prev) => {
        if (prev.activeChannelType === "plugin" || prev.selectedProviderId) return prev;
        const hostId = res.current && !isPluginProviderId(res.current) ? res.current : null;
        return hostId ? { ...prev, selectedProviderId: hostId } : prev;
      });
    } catch (e) {
      console.warn("加载系统供应商失败:", e);
    } finally {
      if (request === channelRequest.current) setLoadingChannels(false);
    }
  };

  useEffect(() => {
    void loadChannels(activeEngine);
    return () => {
      channelRequest.current++;
    };
  }, [activeEngine]);

  const pluginCustomChannels = useMemo(() => {
    return state.pluginChannels?.[activeEngine] || [];
  }, [state.pluginChannels, activeEngine]);

  const systemChannels = useMemo(() => {
    return channels.filter((c) => !c.id.startsWith("plugin_"));
  }, [channels]);

  const [channelTab, setChannelTab] = useState<"system" | "plugin">(() => {
    return state.activeChannelType === "plugin" ? "plugin" : "system";
  });

  useEffect(() => {
    if (state.activeChannelType === "plugin") {
      setChannelTab("plugin");
    } else {
      setChannelTab("system");
    }
  }, [activeEngine, state.activeChannelType]);

  const activeChannel = useMemo(() => {
    if (state.activeChannelType === "plugin") {
      const p =
        pluginCustomChannels.find(
          (c) => c.id === state.activePluginChannelId,
        ) || pluginCustomChannels[0];
      if (p) {
        return {
          id: p.id,
          name: p.name,
          baseUrl: p.baseUrl,
          apiKey: p.apiKey,
          model: p.model || "",
          isPlugin: true,
        };
      }
    }
    const sys = systemChannels.find(
      (c) => c.id === (state.selectedProviderId || currentChannelId),
    );
    if (sys) {
      return {
        id: sys.id,
        name: sys.name,
        baseUrl: sys.baseUrl,
        apiKey: sys.apiKey,
        model: sys.model || "",
        isPlugin: false,
        settingsConfig: sys.settingsConfig,
        raw: sys.raw,
      };
    }
    return null;
  }, [
    state.activeChannelType,
    state.activePluginChannelId,
    pluginCustomChannels,
    systemChannels,
    currentChannelId,
    state.selectedProviderId,
  ]);

  const nativeActive = activeChannel?.id === NATIVE_PROVIDER_ID;
  useEffect(() => {
    const request = ++modelRequest.current;
    const cachedCatalog = peekNativeCatalog(activeEngine);
    if (cachedCatalog) {
      setNativeModels(cachedCatalog.models);
      setNativeAuthoritative(cachedCatalog.authoritative);
    } else {
      setNativeModels([]);
      setNativeAuthoritative(false);
    }
    setFetchingModels(false);
    if (nativeActive && !loadingChannels) {
      if (!cachedCatalog || cachedCatalog.models.length === 0) {
        setFetchingModels(true);
      }
      void loadNativeChannelModels(ctx, activeEngine, activeChannel)
        .then((catalog) => {
          if (request === modelRequest.current) {
            setNativeModels(catalog.models);
            setNativeAuthoritative(catalog.authoritative);
          }
        })
        .catch(() => {
          if (request === modelRequest.current) setStatusMsg("系统渠道模型读取失败，请检查当前 Base URL 和 API Key");
        }).finally(() => { if (request === modelRequest.current) setFetchingModels(false); });
    }
    return () => {
      modelRequest.current++;
    };
  }, [activeEngine, activeChannel, nativeActive, loadingChannels]);

  const sortedSystemChannels = useMemo(() => {
    if (systemChannels.length <= 1) return systemChannels;
    const isSysActive = state.activeChannelType !== "plugin";
    const curId = state.selectedProviderId || currentChannelId || activeChannel?.id;
    return [...systemChannels].sort((a, b) => {
      if (isSysActive) {
        if (a.id === curId) return -1;
        if (b.id === curId) return 1;
      }
      return 0;
    });
  }, [
    systemChannels,
    currentChannelId,
    activeChannel,
    state.activeChannelType,
  ]);

  const sortedPluginChannels = useMemo(() => {
    if (pluginCustomChannels.length <= 1) return pluginCustomChannels;
    const isPlugActive = state.activeChannelType === "plugin";
    const curId = state.activePluginChannelId;
    return [...pluginCustomChannels].sort((a, b) => {
      if (isPlugActive) {
        if (a.id === curId) return -1;
        if (b.id === curId) return 1;
      }
      return 0;
    });
  }, [
    pluginCustomChannels,
    state.activePluginChannelId,
    state.activeChannelType,
  ]);

  const [scrubStatus, setScrubStatus] = useState<ScrubStatus>("unknown");
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubMessage, setScrubMessage] = useState("");
  const scrubPending = useRef(false);
  const scrubRequest = useRef(0);

  useEffect(() => {
    const request = ++scrubRequest.current;
    setScrubStatus("unknown");
    setScrubMessage("");
    // Prompt cleaning is opt-in: opening the dialog never inspects the local CLI.
    scrubPending.current = false;
    setScrubbing(false);
    return () => { scrubRequest.current++; };
  }, [activeEngine, ctx]);

  const runScrubAction = async (action: "check" | "apply" | "restore") => {
    if (scrubPending.current) return;
    scrubPending.current = true;
    const request = ++scrubRequest.current;
    setScrubbing(true);
    setScrubStatus("unknown");
    setScrubMessage("");
    try {
      const result = action === "apply" ? await applyScrubPrompt(ctx)
        : action === "restore" ? await restoreOfficialPrompt(ctx) : null;
      const checked = await checkScrubStatus(ctx);
      if (request !== scrubRequest.current) return;
      setScrubStatus(checked.status);
      setScrubMessage(result ? result.message + "\n" + (checked.message || "") : checked.message || "");
    } catch (error) {
      if (request === scrubRequest.current) setScrubMessage(error instanceof Error ? error.message : "检测失败");
    } finally {
      if (request === scrubRequest.current) {
        scrubPending.current = false;
        setScrubbing(false);
      }
    }
  };
  const handleCheckScrub = () => runScrubAction("check");
  const handleApplyScrub = () => runScrubAction("apply");
  const handleRestoreOfficial = () => runScrubAction("restore");

  const modelOptions = useMemo(() => {
    if (!activeChannel) {
      return [];
    }

    const pId = channelModelKey(activeEngine, activeChannel.id);
    const legacyKey = activeEngine === legacyEngine.current ? activeChannel.id : "";
    const fetched = state.fetchedModels?.[pId] || state.fetchedModels?.[legacyKey] || [];
    const custom = state.customModels?.[pId] || state.customModels?.[legacyKey] || [];
    const baseDefault = activeChannel.model ? [activeChannel.model] : [];

    // 从渠道 settingsConfig/raw 中读取预设模型列表 (如 omp / pi 的 models.yml)
    const rawObj = activeChannel.raw as { models?: Array<{ id: string; name?: string }> } | undefined;
    const cfgObj = activeChannel.settingsConfig as { models?: Array<{ id: string; name?: string }> } | undefined;
    const channelPredefinedModels = (
      cfgObj?.models ||
      rawObj?.models ||
      []
    ).filter((m) => m && typeof m.id === "string" && isConcreteModel(m.id));

    const channelModelIds = channelPredefinedModels.map((m) => m.id);

    // 针对当前渠道匹配原生模型库 (支持 provider 字段过滤)
    const matchingNativeModels = nativeModels.filter((m) => {
      if (nativeActive) return true;
      if (m.provider && m.provider === activeChannel.id) return true;
      const stripped = m.id.replace(new RegExp(`^${activeChannel.id}/`), "");
      return channelModelIds.includes(m.id) || channelModelIds.includes(stripped);
    });

    const normalizeId = (id: string): string => {
      if (!nativeActive && id.startsWith(`${activeChannel.id}/`)) {
        return id.slice(activeChannel.id.length + 1);
      }
      return id;
    };

    const fetchedIds = new Set([
      ...fetched.map(normalizeId),
      ...baseDefault.map(normalizeId),
      ...channelModelIds.map(normalizeId),
      ...(nativeActive || matchingNativeModels.length > 0
        ? matchingNativeModels.map((m) => normalizeId(m.id))
        : []),
    ]);
    const rawList = Array.from(new Set([...custom.map(normalizeId), ...fetchedIds])).filter(isConcreteModel);

    if (rawList.length > 0) {
      const options = rawList.map((m) => {
        const native = matchingNativeModels.find(
          (entry) =>
            normalizeId(entry.id) === m ||
            entry.id === m ||
            entry.id === `${activeChannel.id}/${m}`,
        ) ||
          (nativeActive
            ? nativeModels.find(
                (entry) =>
                  normalizeId(entry.id) === m ||
                  entry.id === m ||
                  entry.id === `${activeChannel.id}/${m}`,
              )
            : undefined);
        const predefined = channelPredefinedModels.find(
          (entry) => normalizeId(entry.id) === m || entry.id === m,
        );

        if (native || predefined) {
          return {
            id: m,
            label: predefined?.name || native?.name || m,
            description:
              native?.description ||
              (activeChannel.name ? `${activeChannel.name}` : "CLI 原生配置"),
            custom: false,
          };
        }
        let desc: string | undefined;
        const lower = m.toLowerCase();
        if (lower.includes("gemini")) desc = "Google Gemini";
        else if (lower.includes("opus")) desc = "Custom Opus model";
        else if (lower.includes("fable")) desc = "Custom Fable model";
        else if (lower.includes("sonnet")) desc = "Custom Sonnet model";
        else if (lower.includes("haiku")) desc = "Custom Haiku model";
        else if (
          lower.includes("gpt") ||
          lower.includes("codex") ||
          lower.includes("o1") ||
          lower.includes("o3")
        ) {
          desc = "OpenAI model";
        } else if (lower.includes("deepseek")) desc = "DeepSeek model";
        else if (lower.includes("qwen")) desc = "Qwen model";
        return { id: m, label: m, description: desc, custom: custom.includes(m) && !fetchedIds.has(m) };
      });
      return options;
    }

    return [];
  }, [
    activeChannel,
    activeEngine,
    nativeActive,
    nativeModels,
    state.fetchedModels,
    state.customModels,
  ]);

  const handleDeleteCustomModel = async (modelId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!activeChannel || busy || fetchingModels) return;
    setPendingDeleteModel(modelId);
  };

  const confirmDeleteCustomModel = async () => {
    const modelId = pendingDeleteModel;
    if (!modelId || !activeChannel || busy || fetchingModels) return;
    setPendingDeleteModel(null);
    const pId = channelModelKey(activeEngine, activeChannel.id);
    const legacyKey = activeEngine === legacyEngine.current ? activeChannel.id : "";
    const key = state.customModels?.[pId] ? pId : legacyKey;
    const nextCustom = (state.customModels?.[key] || []).filter(id => id !== modelId);
    const nextState: PluginState = {
      ...state,
      customModels: { ...state.customModels, [key]: nextCustom },
      selectedModel: bareSelectedModel === modelId ? "" : state.selectedModel,
    };
    await onSave(nextState);
    setState(nextState);
    if (bareSelectedModel === modelId) setStatusMsg("已删除自定义模型，请重新选择模型");
  };

  const filteredModelOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return modelOptions;
    return modelOptions.filter(
      (m) =>
        m.label.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q)),
    );
  }, [modelOptions, searchQuery]);

  const handleSelectSystemProvider = async (channel: {
    id: string;
    name: string;
    model?: string;
  }) => {
    if (busy || fetchingModels || selectionPending.current) return;
    if (state.activeChannelType !== "plugin" && channel.id === (state.selectedProviderId || currentChannelId)) return;
    const error = sessionSelectionError(activeEngine) ||
      (channel.model ? modelSelectionError(activeEngine, channel.model) : null);
    if (error) { setStatusMsg(error); return; }
    selectionPending.current = true;
    setSwitching(true);
    const nextState: PluginState = {
      ...state,
      selectedProviderId: channel.id,
      selectedModel: "",
      activeChannelType: "system",
      activePluginChannelId: undefined,
    };
    try {
      await setSystemCurrentProvider(activeEngine, channel.id);
      setCurrentChannelId(channel.id);
      setState(nextState);
      await onSave(nextState);
      await applyModelSelectionToHost({
        engine: activeEngine,
        model: "",
        effort: state.effort,
        enable1M: state.enable1MContext,
      });
      setStatusMsg(`已生效: ${channel.name}`);
      setTimeout(() => setStatusMsg(null), 2000);
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "切换失败");
    } finally {
      selectionPending.current = false;
      setSwitching(false);
    }
  };

  const handleSelectPluginChannel = async (channel: CustomPluginChannel) => {
    if (busy || fetchingModels || selectionPending.current) return;
    const error = sessionSelectionError(activeEngine) || (channel.model ? modelSelectionError(activeEngine, channel.model) : null);
    if (error) { setStatusMsg(error); return; }
    selectionPending.current = true;
    setSwitching(true);
    const nextState: PluginState = {
      ...state,
      activeChannelType: "plugin",
      activePluginChannelId: channel.id,
      selectedProviderId: channel.id,
      selectedModel: "",
    };
    try {
      await applyCustomPluginChannelToEngine(ctx, activeEngine, channel);
      await applyModelSelectionToHost({ engine: activeEngine, model: "" });
      setState(nextState);
      await onSave(nextState);
      setStatusMsg(`已生效: ${channel.name}`);
      setTimeout(() => setStatusMsg(null), 2000);
    } catch (e) {
      console.error(e);
      setStatusMsg(`应用失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      selectionPending.current = false;
      setSwitching(false);
    }
  };

  const handleSaveNewChannel = async () => {
    if (viewingChannelId || busy || fetchingModels || selectionPending.current) return;
    const error = sessionSelectionError(activeEngine) || (channelForm.model ? modelSelectionError(activeEngine, channelForm.model) : null);
    if (error) { setStatusMsg(error); return; }
    if (!channelForm.name.trim()) {
      setStatusMsg("请输入渠道名称");
      return;
    }
    if (!channelForm.baseUrl.trim()) {
      setStatusMsg("请输入 Base URL");
      return;
    }
    if (!channelForm.apiKey.trim()) {
      setStatusMsg("请输入 API Key");
      return;
    }

    const newChan: CustomPluginChannel = {
      id: editingChannelId || `custom_${Date.now()}`,
      name: channelForm.name.trim(),
      baseUrl: channelForm.baseUrl.trim().replace(/\/+$/, ""),
      apiKey: channelForm.apiKey.trim(),
      model: channelForm.model.trim(),
      createdAt: Date.now(),
    };

    const currentList = state.pluginChannels?.[activeEngine] || [];
    const nextState: PluginState = {
      ...state,
      activeChannelType: "plugin",
      activePluginChannelId: newChan.id,
      selectedProviderId: newChan.id,
      selectedModel: "",
      pluginChannels: {
        ...state.pluginChannels,
        [activeEngine]: editingChannelId ? currentList.map(channel => channel.id === editingChannelId ? newChan : channel) : [newChan, ...currentList],
      },
    };

    selectionPending.current = true;
    setSwitching(true);
    try {
      await applyCustomPluginChannelToEngine(ctx, activeEngine, newChan);
      await onSave(nextState);
      setState(nextState);
      setChannelTab("plugin");
      closeChannelForm();
      setStatusMsg(`已生效: ${newChan.name}`);
    } catch (e) {
      setStatusMsg(
        `应用失败: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      selectionPending.current = false;
      setSwitching(false);
    }
    setTimeout(() => setStatusMsg(null), 2500);
  };

  const handleEditPluginChannel = (channel: CustomPluginChannel, event: React.MouseEvent) => {
    event.stopPropagation();
    setViewingChannelId(null);
    setEditingChannelId(channel.id);
    setChannelForm({ name: channel.name, baseUrl: channel.baseUrl, apiKey: channel.apiKey, model: channel.model || "" });
    setChannelTab("plugin");
    setShowAddChannel(true);
  };

  /** 系统渠道只读查看，不进入编辑/保存流程 */
  const handleViewSystemChannel = (channel: SystemProviderChannel, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingChannelId(null);
    setViewingChannelId(channel.id);
    setChannelForm({
      name: channel.name,
      baseUrl: channel.baseUrl,
      apiKey: channel.apiKey,
      model: channel.model || "",
    });
    setChannelTab("system");
    setShowAddChannel(true);
  };

  const closeChannelForm = () => {
    setShowAddChannel(false);
    setEditingChannelId(null);
    setViewingChannelId(null);
    setChannelForm({ name: "", baseUrl: "", apiKey: "", model: "" });
  };

  const handleDeletePluginChannel = async (
    channelId: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (busy || fetchingModels || selectionPending.current) return;
    const error = sessionSelectionError(activeEngine);
    if (error) { setStatusMsg(error); return; }
    const currentList = state.pluginChannels?.[activeEngine] || [];
    const nextChannels = currentList.filter((c) => c.id !== channelId);
    const isDeletingCurrent =
      state.activeChannelType === "plugin" &&
      state.activePluginChannelId === channelId;

    selectionPending.current = true;
    setSwitching(true);
    try {
      const fallbackId =
        currentChannelId && !isPluginProviderId(currentChannelId)
          ? currentChannelId
          : NATIVE_PROVIDER_ID;
      const nextState: PluginState = {
        ...state,
        activeChannelType: isDeletingCurrent ? "system" : state.activeChannelType,
        activePluginChannelId: isDeletingCurrent
          ? undefined
          : state.activePluginChannelId,
        selectedProviderId: isDeletingCurrent
          ? fallbackId
          : state.selectedProviderId,
        pluginChannels: {
          ...state.pluginChannels,
          [activeEngine]: nextChannels,
        },
      };
      await deleteCustomPluginChannel(activeEngine, channelId);
      if (isDeletingCurrent) {
        await setSystemCurrentProvider(activeEngine, fallbackId);
        setCurrentChannelId(fallbackId);
      }
      await onSave(nextState);
      setState(nextState);
      setStatusMsg("已删除该渠道");
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "删除渠道失败");
    } finally {
      selectionPending.current = false;
      setSwitching(false);
    }
    setTimeout(() => setStatusMsg(null), 1500);
  };

  const handleFetchModels = async () => {
    if (busy || fetchingModels) return;
    if (!activeChannel || (!nativeActive && !activeChannel.baseUrl)) {
      setStatusMsg("当前渠道未配置 Base URL");
      return;
    }
    setFetchingModels(true);
    const request = ++modelRequest.current;
    setStatusMsg("正在探测 CLI 与拉取模型...");
    try {
      // 1. 同步强制刷新所有 CLI 引擎的安装可用状态 (感知外部 CLI 升级/安装)
      const freshEnginesPromise = getSystemEngines(true).catch(() => null);

      if (nativeActive) {
        invalidateNativeCatalogCache(activeEngine);
        const [catalog, freshEngines] = await Promise.all([
          loadNativeChannelModels(ctx, activeEngine, activeChannel, true),
          freshEnginesPromise,
        ]);
        if (freshEngines && freshEngines.length > 0) {
          setEngines(freshEngines);
        }
        if (request !== modelRequest.current) return;
        setNativeModels(catalog.models);
        setNativeAuthoritative(catalog.authoritative);
        setStatusMsg(`已更新 CLI 状态并读取 ${catalog.models.length} 个系统渠道模型`);
        return;
      }
      const [models, freshEngines] = await Promise.all([
        fetchModelsFromProvider(
          ctx,
          activeChannel.baseUrl,
          activeChannel.apiKey,
        ),
        freshEnginesPromise,
      ]);
      if (freshEngines && freshEngines.length > 0) {
        setEngines(freshEngines);
      }
      if (request !== modelRequest.current) return;
      if (models.length === 0) {
        setStatusMsg("返回模型列表为空");
      } else {
        const pId = channelModelKey(activeEngine, activeChannel.id);
        const nextState: PluginState = {
          ...state,
          fetchedModels: { ...state.fetchedModels, [pId]: models },
        };
        setState(nextState);
        await onSave(nextState);
        setStatusMsg(`已拉取 ${models.length} 个模型`);
      }
    } catch (e) {
      if (request === modelRequest.current) setStatusMsg(e instanceof Error ? e.message : "拉取失败");
    } finally {
      if (request === modelRequest.current) setFetchingModels(false);
    }
  };

  const handleAddCustomModel = async () => {
    const id = customInput.trim();
    if (!id || !activeChannel) return;
    const pId = channelModelKey(activeEngine, activeChannel.id);
    const currentCustom = state.customModels?.[pId] ||
      (activeEngine === legacyEngine.current ? state.customModels?.[activeChannel.id] : []) || [];
    const nextCustom = currentCustom.includes(id)
      ? currentCustom
      : [id, ...currentCustom];
    const nextState: PluginState = {
      ...state,
      selectedModel: id,
      customModels: { ...state.customModels, [pId]: nextCustom },
    };
    if (await commitSelection(nextState)) setCustomInput("");
  };

  const nativeIds = nativeActive ? nativeModels.map((model) => model.id) : undefined;
  const compatibilityFor = (model: string) => {
    const protocols = nativeModels.find(entry => entry.id === model.replace(/\[1m\]$/i, ""))?.protocols;
    return nativeActive ? {
      nativeIds, authoritative: nativeAuthoritative && nativeIds?.includes(model.replace(/\[1m\]$/i, "")),
      modelProtocols: Array.isArray(protocols) ? protocols : undefined,
      engineProtocols: engines.find(engine => engine.id === activeEngine)?.supportedProtocols,
    } : undefined;
  };
  const selectionError = (model: string) => sessionSelectionError(activeEngine) ||
    (engines.find(engine => engine.id === activeEngine)?.disabled ? "当前 CLI 不可用" : null) ||
    modelSelectionError(activeEngine, model, compatibilityFor(model));
  const commitSelection = async (nextState: PluginState) => {
    if (busy || fetchingModels || selectionPending.current) return false;
    const targetModel = (nextState.selectedModel || activeChannel?.model || "").trim();
    const error = selectionError(targetModel);
    if (error) { setStatusMsg(error); return false; }
    selectionPending.current = true;
    setSwitching(true);
    try {
      await applyModelSelectionToHost({
        engine: activeEngine,
        model: targetModel,
        effort: nextState.effort,
        enable1M: nextState.enable1MContext,
        compatibility: compatibilityFor(targetModel),
      });
      const sessionError = sessionSelectionError(activeEngine);
      if (sessionError) throw new Error(sessionError);
      const cleanModel = targetModel.replace(/\[1m\]$/i, "");
      const saved = { ...nextState, selectedCli: activeEngine, selectedModel: cleanModel };
      await onSave(saved);
      setState(saved);
      setStatusMsg(null);
      return true;
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "模型切换失败");
      return false;
    } finally {
      selectionPending.current = false;
      setSwitching(false);
    }
  };

  const handleSelectModel = async (modelId: string) => {
    const nextState: PluginState = {
      ...state,
      selectedCli: activeEngine,
      selectedModel: modelId,
    };
    await commitSelection(nextState);
  };

  const handleEffortChange = async (effort: EffortLevel) => {
    const nextState: PluginState = { ...state, effort };
    await commitSelection(nextState);
  };

  const handleToggle1M = async (enabled: boolean) => {
    const nextState: PluginState = { ...state, enable1MContext: enabled };
    await commitSelection(nextState);
  };

  const handlePickEngine = (item: EngineItemRule) => {
    if (item.disabled || busy || fetchingModels || item.id === activeEngine) return;
    const error = sessionSelectionError(item.id);
    if (error) { setStatusMsg(error); return; }
    setLoadingChannels(true);
    modelRequest.current++;
    const cached = peekNativeCatalog(item.id);
    if (cached) {
      setNativeModels(cached.models);
      setNativeAuthoritative(cached.authoritative);
    } else {
      setNativeModels([]);
      setNativeAuthoritative(false);
    }
    setActiveEngine(item.id);
    setSearchQuery("");
    setCustomInput("");
    closeChannelForm();
    setState((prev) => ({ ...prev, selectedCli: item.id, selectedModel: "", activeChannelType: "system" }));
  };

  const bareSelectedModel = state.selectedModel.replace(/\[1m\]$/, "");
  const currentEngineObj = engines.find((e) => e.id === activeEngine);
  const engineHeader = currentEngineObj?.label ?? activeEngine;

  const channelBrand = (name: string, model?: string, url?: string, isNative?: boolean) => {
    if (isNative || name === "CLI 原生配置") {
      return activeEngine;
    }
    return (
      inferModelEngine(name) ||
      inferModelEngine(model || "") ||
      inferModelEngine(url || "") ||
      activeEngine
    );
  };

  return (
    <div
      ref={menuRef}
      className="ms-flyout"
      role="dialog"
      aria-label="模型与渠道"
      aria-busy={busy}
      tabIndex={-1}
      style={{
        transform: menuLayout.offsetX
          ? `translateX(${menuLayout.offsetX}px)`
          : undefined,
        maxHeight: `${menuLayout.maxHeight}px`,
        top: menuLayout.below ? "calc(100% + 8px)" : undefined,
        bottom: menuLayout.below ? "auto" : "calc(100% + 8px)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{flyoutStyles}</style>
      <div className="ms-content" {...(busy ? { inert: "" } : {})}>
      <header className="ms-header">
        <div className="ms-header-title">
          <ProjectEngineIcon engine={activeEngine} size={22} />
          <h2>模型与渠道</h2>
          <span className="ms-badge">{engineHeader}</span>
        </div>
        <div className="ms-actions">
          {themeManager && (
            <button
              type="button"
              className={ICON_BTN}
              aria-label="外观"
              title="外观设置"
              aria-pressed={showThemePanel}
              onClick={() => setShowThemePanel((prev) => !prev)}
            >
              <PaletteIcon size={17} />
            </button>
          )}
          <button
            type="button"
            className={ICON_BTN}
            aria-label="关闭弹窗"
            title="关闭弹窗"
            onClick={() => {
              onClose();
              triggerRef?.current?.focus();
            }}
          >
            <CloseIcon size={17} />
          </button>
        </div>
      </header>
      {showThemePanel && themeManager ? (
        <div className="ms-theme-scroll">
          <ThemeSettingsPanel
            manager={themeManager}
            onClose={() => setShowThemePanel(false)}
          />
        </div>
      ) : (
        <div className="ms-body">
          {/* 左：渠道，对齐宿主 CLI 列表的 p-1 行表面 */}
          <div className="ms-channels">
            <div className="ms-section-heading">
              <h3>供应商渠道</h3>
              <span className="ms-count">
                {channelTab === "system"
                  ? systemChannels.length
                  : pluginCustomChannels.length}
              </span>
            </div>
            <div className="ms-channel-toolbar">
              <div className="ms-segments" role="group" aria-label="渠道来源">
                <button
                  type="button"
                  onClick={() => {
                    if (channelTab !== "system") closeChannelForm();
                    setChannelTab("system");
                  }}
                  aria-pressed={channelTab === "system"}
                  className={`${ROW} ${
                    channelTab === "system" ? ROW_ON : ROW_OFF
                  }`}
                >
                  系统渠道
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (channelTab !== "plugin") closeChannelForm();
                    setChannelTab("plugin");
                  }}
                  aria-pressed={channelTab === "plugin"}
                  className={`${ROW} ${
                    channelTab === "plugin" ? ROW_ON : ROW_OFF
                  }`}
                >
                  独立渠道
                </button>
              </div>
              <span className="ms-actions">
                {channelTab === "plugin" ? (
                  <button
                    type="button"
                    aria-label={showAddChannel ? "收起" : "新增渠道"}
                    title={showAddChannel ? "收起" : "新增独立渠道"}
                    onClick={() => {
                      if (showAddChannel) {
                        closeChannelForm();
                        return;
                      }
                      setViewingChannelId(null);
                      setEditingChannelId(null);
                      setChannelForm({ name: "", baseUrl: "", apiKey: "", model: "" });
                      setShowAddChannel(true);
                    }}
                    aria-expanded={showAddChannel}
                    className={ICON_BTN}
                  >
                    {showAddChannel ? (
                      <CloseIcon size={14} />
                    ) : (
                      <PlusIcon size={14} />
                    )}
                  </button>
                ) : null}
              </span>
            </div>

            {showAddChannel ? (
              <div className="ms-channel-form">
                <label>
                  渠道名称
                  <input
                    value={channelForm.name}
                    readOnly={!!viewingChannelId}
                    onChange={(e) =>
                      setChannelForm({ ...channelForm, name: e.target.value })
                    }
                    placeholder="渠道名称"
                    className={FIELD}
                  />
                </label>
                <label>
                  Base URL
                  <input
                    value={channelForm.baseUrl}
                    readOnly={!!viewingChannelId}
                    onChange={(e) =>
                      setChannelForm({
                        ...channelForm,
                        baseUrl: e.target.value,
                      })
                    }
                    placeholder="Base URL"
                    className={FIELD}
                  />
                </label>
                <label>
                  API Key
                  <SecretInput
                    key={`${viewingChannelId || editingChannelId || "new"}-key`}
                    value={channelForm.apiKey}
                    readOnly={!!viewingChannelId}
                    onChange={(value) =>
                      setChannelForm({ ...channelForm, apiKey: value })
                    }
                    placeholder="API Key"
                  />
                </label>
                <label>
                  默认模型
                  <input
                    value={channelForm.model}
                    readOnly={!!viewingChannelId}
                    onChange={(e) =>
                      setChannelForm({ ...channelForm, model: e.target.value })
                    }
                    placeholder="默认模型 ID（可选）"
                    className={FIELD}
                  />
                </label>
                <div className="ms-form-actions">
                  <button
                    type="button"
                    onClick={closeChannelForm}
                    className="ms-button"
                  >
                    {viewingChannelId ? "关闭" : "取消"}
                  </button>
                  {viewingChannelId ? null : (
                    <button
                      type="button"
                      onClick={handleSaveNewChannel}
                      className="ms-button ms-primary"
                    >
                      {editingChannelId ? "保存修改" : "保存"}
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            <div
              className="ms-channel-list"
              role="group"
              aria-label="供应商渠道"
              aria-busy={loadingChannels}
            >
              {channelTab === "system" ? (
                sortedSystemChannels.length === 0 ? (
                  <span className="ms-empty">
                    {loadingChannels ? "正在加载…" : "尚未配置系统供应商"}
                  </span>
                ) : (
                  sortedSystemChannels.map((ch) => (
                    <ChannelRow
                      key={ch.id}
                      disabled={fetchingModels}
                      name={ch.name}
                      url={ch.baseUrl}
                      detail={ch.remark}
                      brand={channelBrand(ch.name, ch.model, ch.baseUrl, ch.isNative)}
                      selected={
                        state.activeChannelType !== "plugin" &&
                        ch.id === (state.selectedProviderId || currentChannelId || activeChannel?.id)
                      }
                      onSelect={() => void handleSelectSystemProvider(ch)}
                      onView={(e) => handleViewSystemChannel(ch, e)}
                    />
                  ))
                )
              ) : sortedPluginChannels.length === 0 ? (
                <span className="ms-empty">暂无独立渠道</span>
              ) : (
                sortedPluginChannels.map((ch) => (
                  <ChannelRow
                    key={ch.id}
                    disabled={fetchingModels}
                    name={ch.name}
                    url={ch.baseUrl}
                    brand={channelBrand(ch.name, ch.model, ch.baseUrl)}
                    selected={
                      state.activeChannelType === "plugin" &&
                      ch.id === state.activePluginChannelId
                    }
                    onSelect={() => void handleSelectPluginChannel(ch)}
                    onDelete={(e) => void handleDeletePluginChannel(ch.id, e)}
                    onEdit={(e) => handleEditPluginChannel(ch, e)}
                  />
                ))
              )}
            </div>

            {activeEngine === "claude" ? (
              <section
                className="ms-scrub"
                aria-label="提示词清洗"
                aria-busy={scrubbing}
              >
                <div className="ms-scrub-heading">
                  <h3>提示词清洗</h3>
                  <button
                    type="button"
                    className={ICON_BTN}
                    disabled={scrubbing}
                    onClick={handleCheckScrub}
                    aria-label="重新检测清洗状态"
                    title="重新检测清洗状态"
                  >
                    <RefreshIcon
                      size={14}
                      className={scrubbing ? "animate-spin" : ""}
                    />
                  </button>
                </div>
                <div className="ms-scrub-controls">
                  <span
                    className="ms-scrub-state"
                    data-state={scrubStatus}
                    role="status"
                  >
                    {scrubbing
                      ? "处理中…"
                      : scrubStatus === "clean"
                        ? "本地特征已替换"
                        : scrubStatus === "unscrubbed"
                          ? "未清洗"
                          : scrubStatus === "not_found"
                            ? "未找到安装文件"
                          : "未检测（默认关闭）"}
                  </span>
                  <span className="ms-actions">
                    {scrubStatus === "unscrubbed" ? (
                      <button
                        type="button"
                        disabled={scrubbing}
                        onClick={handleApplyScrub}
                        className="ms-button"
                      >
                        {scrubbing ? "…" : "清洗"}
                      </button>
                    ) : scrubStatus === "clean" ? (
                      <button
                        type="button"
                        disabled={scrubbing}
                        onClick={handleRestoreOfficial}
                        className="ms-button"
                      >
                        恢复
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={scrubbing}
                        onClick={handleCheckScrub}
                        className="ms-button"
                      >
                        {scrubbing ? "…" : "检测"}
                      </button>
                    )}
                  </span>
                </div>
                {scrubMessage && <p className="ms-scrub-message" role="status">{scrubMessage}</p>}
              </section>
            ) : null}
          </div>

          {/* 右：对齐宿主 EngineModelPanel */}
          <div className="ms-models">
            <div className="ms-section-heading">
              <h3>
                可用模型{" "}
                <span className="ms-count">{filteredModelOptions.length}</span>
              </h3>
              <span className="ms-actions">
                <button
                  type="button"
                  aria-label="拉取模型"
                  title="拉取当前渠道模型"
                  disabled={fetchingModels || !activeChannel}
                  onClick={handleFetchModels}
                  className={ICON_BTN}
                >
                  <RefreshIcon
                    size={14}
                    className={fetchingModels ? "animate-spin" : ""}
                  />
                </button>
              </span>
            </div>

            <div className="ms-search">
              <SearchIcon size={14} className="ms-search-icon" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索模型…"
                aria-label="搜索模型"
                className={FIELD}
              />
            </div>

            <div className="ms-model-list" role="group" aria-label="可用模型" aria-busy={fetchingModels}>
              {fetchingModels ? (
                <div className="ms-model-loading" role="status">
                  <span className="ms-loading-caption"><RefreshIcon size={16} className="animate-spin" />正在加载模型…</span>
                  {[0, 1, 2].map((row) => <div key={row} className="ms-skeleton-row" aria-hidden="true"><span /><div><i /><i /></div></div>)}
                </div>
              ) : filteredModelOptions.length === 0 ? (
                <span className="ms-empty">{searchQuery ? "无匹配模型" : "暂无模型"}</span>
              ) : (
                filteredModelOptions.map((opt) => {
                  const isSelected = Boolean(
                    bareSelectedModel === opt.id ||
                    (activeChannel &&
                      (bareSelectedModel === `${activeChannel.id}/${opt.id}` ||
                        opt.id === `${activeChannel.id}/${bareSelectedModel}`)),
                  );
                  const error = selectionError(opt.id);
                  const modelBrand =
                    (opt.id !== "default"
                      ? inferModelEngine(opt.label) || inferModelEngine(opt.id)
                      : null) || activeEngine;
                  return (
                    <div key={opt.id} className={`ms-model-row ${isSelected ? ROW_ON : ""}`}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      title={error || opt.label}
                      disabled={!!error}
                      onClick={() => void handleSelectModel(opt.id)}
                      className={`${ROW} ${ROW_OFF}`}
                    >
                      <ProjectEngineIcon engine={modelBrand} size={18} />
                      <span className="ms-row-copy">
                        <span className="ms-row-title">{opt.label}</span>
                        {opt.description ? (
                          <span className="ms-row-detail">
                            {opt.description}
                          </span>
                        ) : null}
                      </span>
                      {isSelected ? (
                        <CheckIcon size={16} className="ms-check" />
                      ) : null}
                    </button>
                    {opt.custom ? <button type="button" className={`${ICON_BTN} ms-model-delete`} aria-label={`删除自定义模型 ${opt.id}`} title="删除自定义模型" onClick={(event) => void handleDeleteCustomModel(opt.id, event)}><TrashIcon size={14} /></button> : null}
                    </div>
                  );
                })
              )}
            </div>

            <div className="ms-custom-model">
              <input
                type="text"
                value={customInput}
                disabled={fetchingModels}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customInput.trim()) {
                    e.preventDefault();
                    void handleAddCustomModel();
                  }
                }}
                placeholder="自定义模型 ID"
                aria-label="自定义模型 ID"
                className={FIELD}
              />
              <button
                type="button"
                disabled={fetchingModels || !customInput.trim() || !activeChannel}
                aria-label="添加自定义模型"
                title="添加自定义模型"
                onClick={() => void handleAddCustomModel()}
                className={`${ICON_BTN} ms-add-model`}
              >
                <PlusIcon size={17} />
              </button>
            </div>

            <EffortSection
              effort={state.effort || "high"}
              onChange={handleEffortChange}
              enable1M={state.enable1MContext}
              onToggle1M={handleToggle1M}
            />
          </div>
        </div>
      )}

      {statusMsg && (
        <div className="ms-status" role="status">
          {statusMsg}
        </div>
      )}

      {pendingDeleteModel && (
        <div className="ms-confirm-backdrop" role="presentation">
          <div className="ms-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ms-delete-title">
            <h3 id="ms-delete-title">删除自定义模型</h3>
            <p>确定删除“{pendingDeleteModel}”吗？此操作不可撤销。</p>
            <div className="ms-confirm-actions">
              <button type="button" className="ms-button" onClick={() => setPendingDeleteModel(null)}>取消</button>
              <button type="button" className="ms-button ms-danger" onClick={() => void confirmDeleteCustomModel()}>确认删除</button>
            </div>
          </div>
        </div>
      )}

      {/* 底部 CLI：宿主 EngineRow 的横向版本 */}
      <div className="ms-engines" role="group" aria-label="CLI 引擎">
        {engines.map((item) => {
          const isSelected = activeEngine === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled || fetchingModels || !!sessionSelectionError(item.id)}
              title={sessionSelectionError(item.id) || item.disabledReason || item.label}
              aria-pressed={isSelected}
              onClick={() => handlePickEngine(item)}
              className={`${ROW} ${isSelected ? ROW_ON : ROW_OFF}`}
            >
              <ProjectEngineIcon engine={item.id} size={18} />
              <span>{item.label}</span>
              {item.id === state.selectedCli && item.available ? (
                <span aria-hidden className="ms-online" />
              ) : null}
            </button>
          );
        })}
      </div>
      </div>
      {busy && <div className="ms-loading-overlay" role="status" aria-live="polite">
        <RefreshIcon size={26} className="animate-spin" />
        <span>正在应用配置…</span>
      </div>}
    </div>
  );
}
