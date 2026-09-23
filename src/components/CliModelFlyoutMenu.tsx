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
  DEFAULT_PI_FAMILY_API,
  EMPTY_CHANNEL_FORM,
  isPiFamilyApiProtocol,
} from "../types";
import {
  getSystemEngines,
  peekSystemEngines,
  optimisticSystemEngines,
  getSystemProviderChannels,
  isPluginProviderId,
  classifyProviderChannels,
  mergePluginChannelsById,
  withoutPluginTwinChannels,
  applyCustomPluginChannelToEngine,
  independentChannelError,
  deleteCustomPluginChannel,
  deleteHostProviderChannel,
  pluginProviderId,
  qualifyEngineModel,
  displayEngineModel,
  withoutCustomModel,
  ensurePiFamilyModelConfigured,
  peekNativeCatalog,
  invalidateNativeCatalogCache,
  type EngineItemRule,
  NATIVE_PROVIDER_ID,
  channelModelKey,
  type NativeModel,
  CLI_ENGINES_CHANGED_EVENT,
  CLI_CONFIG_CHANGED_EVENT,
  readEnableEffortLevel,
} from "../system-bridge";
import { fetchModelsFromProvider, loadNativeChannelModels } from "../api";
import {
  ProjectEngineIcon,
  RefreshIcon,
  PaletteIcon,
  inferModelEngine,
} from "../icons";
import { flyoutStyles } from "./flyout-styles";
import { ThemeSettingsPanel } from "./ThemeSettingsPanel";
import type { GuiThemeManager } from "../theme-manager";
import {
  applyModelSelectionToHost,
  applyChannelSelectionToHost,
  hostSessionSelectionError as sessionSelectionError,
  getLastDiagnostic,
} from "../sync-host";
import { useSessionDisplay, withSessionDisplay } from "../session-display";
import { getHostSession, modelSelectionError, isConcreteModel } from "../selection-policy";
import { ScrubSection } from "./ScrubSection";
import { ChannelSection } from "./ChannelSection";
import { ModelListSection, type ModelOptionItem } from "./ModelListSection";

const ROW = "ms-row";
const ROW_ON = "is-selected";
const ROW_OFF = "";
const ICON_BTN = "ms-icon-button";

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
  const [activeEngine, setActiveEngine] = useState<CliEngineId>(state.selectedCli);
  const [channels, setChannels] = useState<SystemProviderChannel[]>([]);
  const initialCachedCatalog = peekNativeCatalog(state.selectedCli);
  const [nativeModels, setNativeModels] = useState<NativeModel[]>(() => initialCachedCatalog?.models ?? []);
  const [nativeAuthoritative, setNativeAuthoritative] = useState(() => initialCachedCatalog?.authoritative ?? false);
  const channelRequest = useRef(0);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const lastFetchedChannelId = useRef<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [switching, setSwitching] = useState(false);
  const selectionPending = useRef(false);
  const committedSelection = useRef<{ sessionKey: string; effort: EffortLevel; model?: string } | null>(null);
  const modelRequest = useRef(0);
  const legacyEngine = useRef(initialState.selectedCli);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [pendingDeleteModel, setPendingDeleteModel] = useState<string | null>(null);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [channelForm, setChannelForm] = useState({ ...EMPTY_CHANNEL_FORM });
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingChannelSource, setEditingChannelSource] = useState<"plugin" | "host" | null>(null);
  const [viewingChannelId, setViewingChannelId] = useState<string | null>(null);
  const [pendingDeleteChannel, setPendingDeleteChannel] = useState<{ id: string; name: string; source: "plugin" | "host" } | null>(null);
  const [menuLayout, setMenuLayout] = useState<{ offsetX: number; maxHeight: number; below: boolean }>({
    offsetX: 0,
    maxHeight: 560,
    below: false,
  });
  const menuRef = useRef<HTMLDialogElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busy = switching;

  useEffect(() => {
    if (!sessionDisplay || selectionPending.current) return;
    if (committedSelection.current && committedSelection.current.sessionKey !== sessionDisplay.sessionKey) {
      committedSelection.current = null;
    }
    if (sessionDisplay.selectedCli !== activeEngine) {
      modelRequest.current++;
      setFetchingModels(false);
      setLoadingChannels(true);
      setActiveEngine(sessionDisplay.selectedCli);
    }
    setState(prev => {
      const next = withSessionDisplay(prev, sessionDisplay);
      const pinned = committedSelection.current;
      // 宿主 displayEfforts/models 刷新滞后时，不要把刚写入的 effort/model 盖回旧值
      if (pinned && pinned.sessionKey === sessionDisplay.sessionKey) {
        return {
          ...next,
          effort: pinned.effort,
          ...(pinned.model !== undefined ? { selectedModel: pinned.model } : {}),
        };
      }
      return next;
    });
  }, [sessionDisplay]);

  useEffect(() => {
    let positionFrame = 0;
    let mobileModal = false;
    const applyLayout = (next: typeof menuLayout) => setMenuLayout(prev =>
      prev.offsetX === next.offsetX && prev.maxHeight === next.maxHeight && prev.below === next.below ? prev : next);
    const updatePosition = () => {
      const menu = menuRef.current;
      const useModal = window.innerWidth <= 600 && typeof menu?.showModal === "function";
      if (menu && useModal !== mobileModal) {
        menu.close();
        if (useModal) menu.showModal();
        else menu.open = true;
        mobileModal = useModal;
      }
      const triggerEl = triggerRef?.current;
      const viewport = window.visualViewport;
      const visibleHeight = viewport?.height ?? window.innerHeight;
      const totalWidth = Math.min(760, window.innerWidth - 24);
      if (window.innerWidth <= 600) {
        applyLayout({ offsetX: 0, maxHeight: Math.max(0, visibleHeight - 24), below: false });
        return;
      }
      if (!triggerEl) {
        applyLayout({ offsetX: 0, maxHeight: window.innerHeight - 24, below: false });
        return;
      }
      const rect = triggerEl.getBoundingClientRect();
      const spaceAbove = rect.top - 20;
      const spaceBelow = window.innerHeight - rect.bottom - 20;
      const below = spaceAbove < 400 && spaceBelow > spaceAbove;
      const preferredHeight = window.innerWidth <= 600 ? 680 : 560;
      const availableHeight = Math.max(0, Math.min(preferredHeight, below ? spaceBelow : spaceAbove));
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - totalWidth - 12));
      applyLayout({ offsetX: left - rect.left, maxHeight: availableHeight, below });
    };
    const schedulePosition = (event: Event) => {
      // Scrolling the model/channel lists does not move the trigger.
      if (event.type === "scroll" && event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      if (positionFrame) return;
      positionFrame = requestAnimationFrame(() => { positionFrame = 0; updatePosition(); });
    };

    updatePosition();
    window.addEventListener("resize", schedulePosition);
    window.visualViewport?.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, { capture: true, passive: true });

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (mobileModal && target === menuRef.current) {
        const rect = menuRef.current.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
          closeRef.current();
          return;
        }
      }
      if (menuRef.current?.contains(target) || triggerRef?.current?.contains(target)) return;
      closeRef.current();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeRef.current();
        triggerRef?.current?.focus();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (mobileModal) menuRef.current?.close();
      cancelAnimationFrame(positionFrame);
      window.removeEventListener("resize", schedulePosition);
      window.visualViewport?.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [triggerRef]);

  useEffect(() => {
    menuRef.current?.focus();
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
      // 仅在完全无渠道选择时，用 res.current 作为兜底（让用户有个起点）
      setState((prev) => {
        if (prev.selectedProviderId || prev.activeChannelType === "plugin") return prev;
        const hostId = res.current && !isPluginProviderId(res.current) ? res.current : null;
        return hostId ? { ...prev, selectedProviderId: hostId, activeChannelType: "system" } : prev;
      });
    } catch (e) {
      console.warn("加载系统供应商失败:", e);
    } finally {
      if (request === channelRequest.current) setLoadingChannels(false);
    }
  };

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

    void getSystemEngines(false).then(applyEngines);
    void getSystemEngines(true).then(applyEngines);

    const handleEnginesChanged = (e: Event) => {
      const customEvent = e as CustomEvent<EngineItemRule[]>;
      if (customEvent.detail) applyEngines(customEvent.detail);
      else void getSystemEngines(true).then(applyEngines);
    };
    const handleConfigChanged = () => void loadChannels(activeEngine);
    const handleWindowFocus = () => void getSystemEngines(true).then(applyEngines);

    window.addEventListener(CLI_ENGINES_CHANGED_EVENT, handleEnginesChanged);
    window.addEventListener(CLI_CONFIG_CHANGED_EVENT, handleConfigChanged);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      cancelled = true;
      window.removeEventListener(CLI_ENGINES_CHANGED_EVENT, handleEnginesChanged);
      window.removeEventListener(CLI_CONFIG_CHANGED_EVENT, handleConfigChanged);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [activeEngine]);

  // 引擎或会话切换时重新读取宿主当前渠道：切换会话页签后引擎可能不变，
  // 但宿主的 current provider 已随会话变化，必须重跑才能恢复高亮
  useEffect(() => {
    void loadChannels(activeEngine);

    // 如果当前会话无对话级记录，立即保存当前状态（避免下次切换回来丢失）
    const stableKey = sessionDisplay?.stableKey;
    if (stableKey && !state.sessionChannels?.[stableKey] && state.selectedProviderId) {
      const sessionChannels = {
        ...state.sessionChannels,
        [stableKey]: {
          selectedCli: activeEngine,
          selectedProviderId: state.selectedProviderId,
          selectedModel: state.selectedModel,
          effort: state.effort,
          enable1MContext: state.enable1MContext,
          activeChannelType: state.activeChannelType,
          activePluginChannelId: state.activePluginChannelId,
          activeChannelName: state.activeChannelName,
        },
      };
      void onSave({ ...state, sessionChannels });
    }

    return () => { channelRequest.current++; };
  }, [activeEngine, sessionDisplay?.stableKey]);

  // 系统 tab：原生 + 宿主供应商配置 + OMP/PI 自己 YAML 里的供应商（都是系统渠道）
  const { systemChannels, independentSystemChannels: yamlHostChannels, pluginYamlChannels } = useMemo(
    () => classifyProviderChannels(channels),
    [channels],
  );

  // 独立 tab 的「插件」行：插件存储 ∪ YAML 带 plugin_ 前缀的条目，按 id 合并，同名不同 id 都显示
  const pluginCustomChannels = useMemo(
    () => mergePluginChannelsById(state.pluginChannels?.[activeEngine] || [], pluginYamlChannels),
    [state.pluginChannels, activeEngine, pluginYamlChannels],
  );

  // 去掉与插件行同 id 的重复 YAML 行（同一渠道在 YAML 里有裸 key + plugin_ 两份）；同名不同 id 保留
  const yamlSystemChannels = useMemo(
    () => withoutPluginTwinChannels(
      yamlHostChannels,
      pluginCustomChannels,
      state.selectedProviderId || currentChannelId,
    ),
    [yamlHostChannels, pluginCustomChannels, state.selectedProviderId, currentChannelId],
  );

  // 系统 tab 的完整列表：宿主/原生渠道 + CLI 自己 YAML 里的供应商
  const allSystemChannels = useMemo(
    () => [...systemChannels, ...yamlSystemChannels],
    [systemChannels, yamlSystemChannels],
  );

  const [channelTab, setChannelTab] = useState<"system" | "plugin">(() => {
    return state.activeChannelType === "plugin" ? "plugin" : "system";
  });

  useEffect(() => {
    // YAML 供应商已并入系统 tab，只有插件渠道才切到独立 tab
    setChannelTab(state.activeChannelType === "plugin" ? "plugin" : "system");
  }, [activeEngine, state.activeChannelType]);

  const activeChannel = useMemo(() => {
    if (state.activeChannelType === "plugin") {
      const p = pluginCustomChannels.find((c) => c.id === state.activePluginChannelId);
      if (p) return { ...p, model: p.model || "", isPlugin: true };
      return null;
    }
    const targetId = state.selectedProviderId || currentChannelId;
    const sys = allSystemChannels.find((c) => c.id === targetId)
      // 若未明确选择且只有一个宿主/原生渠道，默认选中（兼容打开已有对话时 loadChannels 尚未完成）
      || (!targetId && systemChannels.length === 1 ? systemChannels[0] : null);
    if (sys) {
      return {
        id: sys.id,
        name: sys.name,
        baseUrl: sys.baseUrl,
        apiKey: sys.apiKey,
        model: sys.model || "",
        api: sys.api,
        isPlugin: false,
        settingsConfig: sys.settingsConfig,
        raw: sys.raw,
      };
    }
    return null;
  }, [state.activeChannelType, state.activePluginChannelId, pluginCustomChannels, systemChannels, allSystemChannels, currentChannelId, state.selectedProviderId]);

  const nativeActive = activeChannel?.id === NATIVE_PROVIDER_ID;
  const useNativeModels = nativeActive && (!activeChannel?.baseUrl || ["omp", "pi", "kimi", "grok"].includes(activeEngine));

  // 缓存 CLI 原生元数据用于后台协议校验，不直接展示在可用模型列表中
  useEffect(() => {
    const cachedCatalog = peekNativeCatalog(activeEngine);
    if (cachedCatalog) {
      setNativeModels(cachedCatalog.models);
      setNativeAuthoritative(cachedCatalog.authoritative);
    } else {
      setNativeModels([]);
      setNativeAuthoritative(false);
    }
  }, [activeEngine]);

  useEffect(() => {
    if (!useNativeModels || loadingChannels) return;
    let cancelled = false;
    void loadNativeChannelModels(ctx, activeEngine, activeChannel).then(catalog => {
      if (cancelled) return;
      setNativeModels(catalog.models);
      setNativeAuthoritative(catalog.authoritative);
    }).catch(error => {
      if (!cancelled) setStatusMsg(`读取 CLI 模型失败: ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { cancelled = true; };
  }, [activeEngine, useNativeModels, loadingChannels]);


  const sortedSystemChannels = useMemo(() => {
    if (allSystemChannels.length <= 1) return allSystemChannels;
    const isSysActive = state.activeChannelType !== "plugin";
    const curId = state.selectedProviderId || currentChannelId || activeChannel?.id;
    return [...allSystemChannels].sort((a, b) => {
      if (isSysActive) {
        if (a.id === curId) return -1;
        if (b.id === curId) return 1;
      }
      return 0;
    });
  }, [allSystemChannels, currentChannelId, activeChannel, state.activeChannelType, state.selectedProviderId]);

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
  }, [pluginCustomChannels, state.activeChannelType, state.activePluginChannelId]);

  const modelOptions = useMemo<ModelOptionItem[]>(() => {
    if (!activeChannel) return [];

    const pId = channelModelKey(activeEngine, activeChannel.id);
    const legacyKey = activeEngine === legacyEngine.current ? activeChannel.id : "";
    const fetched = useNativeModels ? nativeModels.map(model => model.id)
      : state.fetchedModels?.[pId] || state.fetchedModels?.[legacyKey] || [];
    const custom = state.customModels?.[pId] || state.customModels?.[legacyKey] || [];

    const normalizeId = (id: string): string =>
      nativeActive ? id : displayEngineModel(activeEngine, activeChannel, id);

    // Native selectors are required by CLI registries; relay channels use their API IDs.
    const normalizedCustom = custom.map(normalizeId).filter(isConcreteModel);
    const normalizedFetched = fetched.map(normalizeId).filter(isConcreteModel);

    // 构成当前渠道可用模型全集（自定义 + 接口获取）
    const allChannelModelIds = new Set<string>();
    for (const id of normalizedCustom) allChannelModelIds.add(id);
    for (const id of normalizedFetched) allChannelModelIds.add(id);

    const selectedBare = displayEngineModel(
      activeEngine,
      activeChannel,
      (state.selectedModel || "").replace(/\[1m\]$/i, "").trim(),
    );

    // 当前选中的模型只有在模型列表（自定义或接口拉取）中确实存在时才在列表中保持选中项
    const isSelectedInList = isConcreteModel(selectedBare) && (
      allChannelModelIds.has(selectedBare) ||
      allChannelModelIds.has(normalizeId(selectedBare))
    );
    const selectedList = isSelectedInList ? [selectedBare] : [];

    // 顺序：选中的模型 id（若在列表中） -> 自定义模型 id -> 接口拉取到的模型 id 列表
    const seen = new Set<string>();
    const rawList: string[] = [];
    for (const id of selectedList) {
      if (!seen.has(id)) {
        seen.add(id);
        rawList.push(id);
      }
    }
    for (const id of normalizedCustom) {
      if (!seen.has(id)) {
        seen.add(id);
        rawList.push(id);
      }
    }
    for (const id of normalizedFetched) {
      if (!seen.has(id)) {
        seen.add(id);
        rawList.push(id);
      }
    }

    const customSet = new Set(custom.map(normalizeId));
    for (const id of custom) customSet.add(id);
    const catalogSet = new Set(normalizedFetched);
    for (const id of fetched) catalogSet.add(id);

    if (rawList.length > 0) {
      return rawList.map((m) => {
        const isCustom = customSet.has(m) || customSet.has(normalizeId(m));
        const isCatalog = catalogSet.has(m) || catalogSet.has(normalizeId(m));
        let desc: string | undefined;
        const lower = m.toLowerCase();
        if (lower.includes("gemini")) desc = "Google Gemini";
        else if (lower.includes("opus")) desc = "Claude Opus";
        else if (lower.includes("fable")) desc = "Claude Fable";
        else if (lower.includes("sonnet")) desc = "Claude Sonnet";
        else if (lower.includes("haiku")) desc = "Claude Haiku";
        else if (lower.includes("gpt") || lower.includes("codex") || lower.includes("o1") || lower.includes("o3") || lower.includes("o4")) desc = "OpenAI model";
        else if (lower.includes("deepseek")) desc = "DeepSeek model";
        else if (lower.includes("qwen")) desc = "Qwen model";
        else if (lower.includes("kimi") || lower.includes("moonshot")) desc = "Moonshot Kimi";
        else if (lower.includes("grok")) desc = "xAI Grok";
        else if (activeChannel.name) desc = activeChannel.name;
        return {
          id: m,
          label: m,
          description: desc,
          custom: isCustom,
          catalog: isCatalog,
        };
      });
    }

    return [];
  }, [activeChannel, activeEngine, nativeActive, useNativeModels, nativeModels, state.fetchedModels, state.customModels, state.selectedModel]);

  const favoriteModelOptions = useMemo(() => modelOptions.filter(model => model.custom), [modelOptions]);
  const catalogModelOptions = useMemo(() => modelOptions.filter(model => model.catalog), [modelOptions]);
  useEffect(() => { setSearchQuery(""); }, [activeEngine, activeChannel?.id]);

  const bareSelectedModel = displayEngineModel(
    activeEngine,
    activeChannel,
    state.selectedModel.replace(/\[1m\]$/i, ""),
  );
  const nativeIds = nativeActive ? nativeModels.map((model) => model.id) : undefined;
  const compatibilityFor = (model: string) => {
    const cleanId = model.replace(/\[1m\]$/i, "");
    const protocols = nativeModels.find((entry) => entry.id === cleanId)?.protocols;
    return nativeActive ? {
      nativeIds,
      authoritative: useNativeModels && nativeAuthoritative && nativeModels.length > 0 && ["kimi", "grok"].includes(activeEngine),
      modelProtocols: Array.isArray(protocols) ? protocols : undefined,
      engineProtocols: engines.find((engine) => engine.id === activeEngine)?.supportedProtocols,
    } : undefined;
  };
  const selectionError = (model: string) => sessionSelectionError(activeEngine) ||
    (engines.find((engine) => engine.id === activeEngine)?.disabled ? "当前 CLI 不可用" : null) ||
    modelSelectionError(activeEngine, model, compatibilityFor(model));
  const commitSelection = async (nextState: PluginState, options?: { silent?: boolean }) => {
    if (busy || fetchingModels || selectionPending.current) return false;
    const targetModel = (nextState.selectedModel || "").trim();
    const hostModel = qualifyEngineModel(activeEngine, activeChannel, targetModel);
    const error = (activeChannel && !nativeActive ? independentChannelError(activeEngine) : null) ||
      selectionError(targetModel) || (hostModel ? selectionError(hostModel) : null);
    if (error) { setStatusMsg(error); return false; }
    const prevState = state;
    const isSilent = options?.silent ?? false;
    selectionPending.current = true;
    if (!isSilent) setSwitching(true);
    const cleanModel = displayEngineModel(activeEngine, activeChannel, hostModel);
    const optimisticState = { ...nextState, selectedCli: activeEngine, selectedModel: cleanModel };
    setState(optimisticState);
    try {
      if (activeChannel && targetModel) {
        await ensurePiFamilyModelConfigured(activeEngine, activeChannel, targetModel);
      }
      await applyModelSelectionToHost({
        engine: activeEngine,
        model: hostModel,
        effort: nextState.effort,
        enable1M: nextState.enable1MContext,
        compatibility: compatibilityFor(targetModel) || compatibilityFor(hostModel),
        ctx,
      });
      const diagnostic = getLastDiagnostic();
      const sessionError = sessionSelectionError(activeEngine);
      if (sessionError) throw new Error(sessionError);
      const saved = { ...nextState, selectedCli: activeEngine, selectedModel: cleanModel };
      committedSelection.current = sessionDisplay
        ? { sessionKey: sessionDisplay.sessionKey, effort: saved.effort, model: cleanModel }
        : null;
      // 对话级渠道隔离：将本次选择记录到 stableKey 下，供切换会话后恢复
      const stableKey = sessionDisplay?.stableKey;
      const sessionChannels = (stableKey && sessionDisplay?.sessionId) ? {
        ...saved.sessionChannels,
        [stableKey]: {
          selectedCli: activeEngine,
          selectedProviderId: saved.selectedProviderId,
          selectedModel: saved.selectedModel,
          effort: saved.effort,
          enable1MContext: saved.enable1MContext,
          activeChannelType: saved.activeChannelType,
          activePluginChannelId: saved.activePluginChannelId,
          activeChannelName: saved.activeChannelName,
        },
      } : saved.sessionChannels;
      const savedWithSessions = { ...saved, sessionChannels };
      await onSave(savedWithSessions);
      setState(savedWithSessions);
      if (diagnostic) {
        setStatusMsg(diagnostic);
        setTimeout(() => setStatusMsg(null), 3000);
      }
      return true;
    } catch (e) {
      setState(prevState);
      const diagnostic = getLastDiagnostic();
      setStatusMsg(`${e instanceof Error ? e.message : "模型切换失败"}${diagnostic ? ` [${diagnostic}]` : ""}`);
      return false;
    } finally {
      selectionPending.current = false;
      if (!isSilent) setSwitching(false);
    }
  };

  const handleSelectModel = async (modelId: string) => {
    await commitSelection({ ...state, selectedCli: activeEngine, selectedModel: modelId }, { silent: true });
  };

  const handleEffortChange = async (effort: EffortLevel) => {
    committedSelection.current = sessionDisplay
      ? { sessionKey: sessionDisplay.sessionKey, effort }
      : null;
    return commitSelection({ ...state, effort }, { silent: true });
  };

  const handleToggle1M = async (enabled: boolean) => {
    await commitSelection({ ...state, enable1MContext: enabled }, { silent: true });
  };

  const handleFetchModels = async () => {
    if (busy || fetchingModels) return;
    if (!activeChannel) return;
    if (useNativeModels) {
      setFetchingModels(true);
      const request = ++modelRequest.current;
      try {
        const catalog = await loadNativeChannelModels(ctx, activeEngine, activeChannel, true);
        if (request !== modelRequest.current) return;
        setNativeModels(catalog.models);
        setNativeAuthoritative(catalog.authoritative);
        setStatusMsg(`已读取 ${catalog.models.length} 个 CLI 模型`);
      } catch (error) {
        if (request === modelRequest.current) setStatusMsg(error instanceof Error ? error.message : String(error));
      } finally {
        if (request === modelRequest.current) setFetchingModels(false);
      }
      return;
    }
    const baseUrl = activeChannel.baseUrl?.trim();
    if (!baseUrl) {
      setStatusMsg("当前渠道未配置 Base URL，无法通过接口获取模型");
      return;
    }
    setFetchingModels(true);
    const request = ++modelRequest.current;
    setStatusMsg("正在通过接口获取模型列表…");
    try {
      const freshEnginesPromise = getSystemEngines(true).catch(() => null);
      const [models, freshEngines] = await Promise.all([
        fetchModelsFromProvider(ctx, baseUrl, activeChannel.apiKey || ""),
        freshEnginesPromise,
      ]);
      if (freshEngines && freshEngines.length > 0) setEngines(freshEngines);
      if (request !== modelRequest.current) return;
      if (models.length === 0) {
        setStatusMsg("接口返回的模型列表为空");
      } else {
        const pId = channelModelKey(activeEngine, activeChannel.id);
        const saved = await new Promise<PluginState>((resolve) => {
          setState((prev) => {
            const next = {
              ...prev,
              fetchedModels: { ...prev.fetchedModels, [pId]: models },
            };
            resolve(next);
            return next;
          });
        });
        await onSave(saved);
        setStatusMsg(`已通过接口获取 ${models.length} 个模型`);
      }
    } catch (e) {
      if (request === modelRequest.current) {
        setStatusMsg(e instanceof Error ? e.message : "接口获取模型失败");
      }
    } finally {
      if (request === modelRequest.current) setFetchingModels(false);
    }
  };

  const handleSearchFocus = () => {
    // 只在切换渠道后首次点击时从接口拉取模型列表，避免在用户搜索时重复拉取
    const channelKey = activeChannel ? `${activeEngine}:${activeChannel.id}` : null;
    if (channelKey && channelKey !== lastFetchedChannelId.current) {
      lastFetchedChannelId.current = channelKey;
      void handleFetchModels();
    }
  };

  const handleAddCustomModel = async (modelId = customInput) => {
    if (!activeChannel || busy || fetchingModels || selectionPending.current) return;
    const id = displayEngineModel(activeEngine, activeChannel, modelId);
    if (!isConcreteModel(id)) return;
    const pId = channelModelKey(activeEngine, activeChannel.id);
    const currentCustom = state.customModels?.[pId] ||
      (activeEngine === legacyEngine.current ? state.customModels?.[activeChannel.id] : []) || [];
    if (currentCustom.some(model => displayEngineModel(activeEngine, activeChannel, model) === id)) {
      setStatusMsg("该模型已在自选列表中");
      return;
    }
    const nextCustom = [id, ...currentCustom];
    const nextState: PluginState = {
      ...state,
      customModels: { ...state.customModels, [pId]: nextCustom },
    };
    selectionPending.current = true;
    setSwitching(true);
    try {
      await onSave(nextState);
      setState(nextState);
      setCustomInput("");
      setSearchQuery("");
      setStatusMsg(`已加入自选: ${id}`);
    } catch (error) {
      setStatusMsg(error instanceof Error ? error.message : "加入自选失败，请重试");
    } finally {
      selectionPending.current = false;
      setSwitching(false);
    }
  };

  const confirmDeleteCustomModel = async () => {
    const modelId = pendingDeleteModel;
    if (!modelId || !activeChannel || busy || fetchingModels || selectionPending.current) return;
    const pId = channelModelKey(activeEngine, activeChannel.id);
    const legacyKey = activeEngine === legacyEngine.current ? activeChannel.id : "";
    const key = state.customModels?.[pId] ? pId : legacyKey;
    const nextCustom = withoutCustomModel(activeEngine, activeChannel, state.customModels?.[key] || [], modelId);
    const nextState: PluginState = {
      ...state,
      customModels: { ...state.customModels, [key]: nextCustom },
    };
    selectionPending.current = true;
    setSwitching(true);
    try {
      await onSave(nextState);
      setState(nextState);
      setPendingDeleteModel(null);
      setStatusMsg("已移出自选");
    } catch (e) {
      setPendingDeleteModel(null);
      setStatusMsg(e instanceof Error ? e.message : "移出自选失败，请重试");
    } finally {
      selectionPending.current = false;
      setSwitching(false);
    }
  };

  const handleSelectSystemProvider = async (channel: { id: string; name: string; model?: string }) => {
    if (busy || fetchingModels || selectionPending.current) return;
    if (state.activeChannelType !== "plugin" && channel.id === (state.selectedProviderId || currentChannelId)) return;
    const hostModel = qualifyEngineModel(activeEngine, channel, channel.model || "");
    const error = sessionSelectionError(activeEngine) || (hostModel ? modelSelectionError(activeEngine, hostModel) : null);
    if (error) { setStatusMsg(error); return; }
    const prevState = state;
    const prevChannelId = currentChannelId;
    selectionPending.current = true;
    setSwitching(true);
    const nextState: PluginState = {
      ...state,
      selectedProviderId: channel.id,
      selectedModel: state.selectedModel ? displayEngineModel(activeEngine, channel, hostModel) : "",
      activeChannelType: "system",
      activePluginChannelId: undefined,
      activeChannelName: channel.name,
    };
    setCurrentChannelId(channel.id);
    setState(nextState);
    try {
      await applyChannelSelectionToHost({ engine: activeEngine, providerId: channel.id });
      await applyModelSelectionToHost({
          engine: activeEngine,
          model: hostModel,
          effort: state.effort,
          enable1M: state.enable1MContext,
          ctx,
      });
      const stableKey = sessionDisplay?.stableKey;
      const sessionChannels = stableKey ? {
        ...nextState.sessionChannels,
        [stableKey]: {
          selectedCli: activeEngine,
          selectedProviderId: nextState.selectedProviderId,
          selectedModel: nextState.selectedModel,
          effort: nextState.effort,
          enable1MContext: nextState.enable1MContext,
          activeChannelType: nextState.activeChannelType,
          activePluginChannelId: nextState.activePluginChannelId,
          activeChannelName: nextState.activeChannelName,
        },
      } : nextState.sessionChannels;
      const savedWithSessions = { ...nextState, sessionChannels };
      await onSave(savedWithSessions);
      setState(savedWithSessions);
      setStatusMsg(hostModel ? `已生效: ${channel.name}` : "渠道已切换，请选择模型");
      setTimeout(() => setStatusMsg(null), 2000);
    } catch (e) {
      setCurrentChannelId(prevChannelId);
      setState(prevState);
      setStatusMsg(e instanceof Error ? e.message : "切换失败");
    } finally {
      selectionPending.current = false;
      setSwitching(false);
    }
  };

  const handleSelectPluginChannel = async (channel: CustomPluginChannel) => {
    if (busy || fetchingModels || selectionPending.current) return;
    const pluginChannel = { ...channel, isPlugin: true as const };
    const hostModel = qualifyEngineModel(activeEngine, pluginChannel, channel.model || "");
    const error = sessionSelectionError(activeEngine) || (hostModel ? modelSelectionError(activeEngine, hostModel) : null);
    if (error) { setStatusMsg(error); return; }
    const prevState = state;
    const prevChannelId = currentChannelId;
    selectionPending.current = true;
    setSwitching(true);
    const nextState: PluginState = {
      ...state,
      activeChannelType: "plugin",
      activePluginChannelId: channel.id,
      selectedProviderId: channel.id,
      selectedModel: state.selectedModel ? displayEngineModel(activeEngine, pluginChannel, hostModel) : "",
      activeChannelName: channel.name,
    };
    setCurrentChannelId(channel.id);
    setState(nextState);
    try {
      await applyCustomPluginChannelToEngine(ctx, activeEngine, channel);
      await applyChannelSelectionToHost({ engine: activeEngine, providerId: pluginProviderId(channel.id) });
      await applyModelSelectionToHost({ engine: activeEngine, model: hostModel, effort: state.effort, enable1M: state.enable1MContext, ctx });
      const stableKey = sessionDisplay?.stableKey;
      const sessionChannels = stableKey ? {
        ...nextState.sessionChannels,
        [stableKey]: {
          selectedCli: activeEngine,
          selectedProviderId: nextState.selectedProviderId,
          selectedModel: nextState.selectedModel,
          effort: nextState.effort,
          enable1MContext: nextState.enable1MContext,
          activeChannelType: nextState.activeChannelType,
          activePluginChannelId: nextState.activePluginChannelId,
          activeChannelName: nextState.activeChannelName,
        },
      } : nextState.sessionChannels;
      const savedWithSessions = { ...nextState, sessionChannels };
      await onSave(savedWithSessions);
      setState(savedWithSessions);
      setStatusMsg(hostModel ? `已生效: ${channel.name}` : "渠道已切换，请选择模型");
      setTimeout(() => setStatusMsg(null), 2000);
    } catch (e) {
      setCurrentChannelId(prevChannelId);
      setState(prevState);
      setStatusMsg(`应用失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      selectionPending.current = false;
      setSwitching(false);
    }
  };

  const handleSaveNewChannel = async () => {
    if (viewingChannelId || busy || fetchingModels || selectionPending.current) return;
    const formModel = channelForm.model.trim();
    const error = sessionSelectionError(activeEngine) || (formModel ? modelSelectionError(activeEngine, formModel) : null);
    if (error) { setStatusMsg(error); return; }
    if (!channelForm.name.trim()) { setStatusMsg("请输入渠道名称"); return; }
    if (!channelForm.baseUrl.trim()) { setStatusMsg("请输入 Base URL"); return; }
    if (!channelForm.apiKey.trim()) { setStatusMsg("请输入 API Key"); return; }
    const needsProtocol = activeEngine === "omp" || activeEngine === "pi";
    if (needsProtocol && !isPiFamilyApiProtocol(channelForm.api)) {
      setStatusMsg("请选择协议类型");
      return;
    }

    // 编辑来源单独记录：插件 YAML 剥前缀后可能与宿主 YAML 的裸 id 相同
    const isEditingHostChannel = editingChannelSource === "host";

    const newChan: CustomPluginChannel = {
      // 编辑时保持原 ID，新建时生成新 ID
      id: editingChannelId || `custom_${Date.now()}`,
      name: channelForm.name.trim(),
      baseUrl: channelForm.baseUrl.trim().replace(/\/+$/, ""),
      apiKey: channelForm.apiKey.trim(),
      model: channelForm.model.trim(),
      api: needsProtocol
        ? (isPiFamilyApiProtocol(channelForm.api) ? channelForm.api : DEFAULT_PI_FAMILY_API)
        : undefined,
      enableEffortLevel: activeEngine === "claude" ? channelForm.enableEffortLevel : undefined,
      createdAt: Date.now(),
    };

    const currentList = state.pluginChannels?.[activeEngine] || [];
    const existsInPluginStore = currentList.some((c) => c.id === newChan.id);
    const nextPluginList = isEditingHostChannel
      ? currentList
      : existsInPluginStore
        ? currentList.map((c) => (c.id === newChan.id ? newChan : c))
        : [newChan, ...currentList];
    const nextState: PluginState = {
      ...state,
      pluginChannels: {
        ...state.pluginChannels,
        [activeEngine]: nextPluginList,
      },
    };

    selectionPending.current = true;
    setSwitching(true);
    try {
      if (isEditingHostChannel && needsProtocol) {
        await applyCustomPluginChannelToEngine(ctx, activeEngine, newChan, { keepOriginalId: true });
        await onSave(state);
        await loadChannels(activeEngine);
      } else {
        await applyCustomPluginChannelToEngine(ctx, activeEngine, newChan);
        await onSave(nextState);
        setState(nextState);
      }
      setChannelTab("plugin");
      closeChannelForm();
      setStatusMsg(`已保存渠道: ${newChan.name}`);
      setTimeout(() => setStatusMsg(null), 2000);
    } catch (e) {
      setStatusMsg(`保存渠道失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      selectionPending.current = false;
      setSwitching(false);
    }
  };

  const handleDeletePluginChannel = async (channelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy || fetchingModels || selectionPending.current) return;
    const error = sessionSelectionError(activeEngine);
    if (error) { setStatusMsg(error); return; }

    const channelToDelete = pluginCustomChannels.find((c) => c.id === channelId);
    if (!channelToDelete) return;

    setPendingDeleteChannel({ id: channelId, name: channelToDelete.name, source: "plugin" });
  };

  const confirmDeleteChannel = async () => {
    if (!pendingDeleteChannel) return;
    const { id: channelId, source } = pendingDeleteChannel;
    setPendingDeleteChannel(null);

    if (source === "host") {
      await confirmDeleteHostChannel(channelId);
    } else {
      await confirmDeletePluginChannel(channelId);
    }
  };

  const confirmDeletePluginChannel = async (channelId: string) => {
    const currentList = state.pluginChannels?.[activeEngine] || [];
    const nextChannels = currentList.filter((c) => c.id !== channelId);
    const isDeletingCurrent = state.activeChannelType === "plugin" && state.activePluginChannelId === channelId;

    selectionPending.current = true;
    setSwitching(true);
    try {
      const fallbackId = !independentChannelError(activeEngine) && currentChannelId && !isPluginProviderId(currentChannelId)
        ? currentChannelId : NATIVE_PROVIDER_ID;
      const nextState: PluginState = {
        ...state,
        activeChannelType: isDeletingCurrent ? "system" : state.activeChannelType,
        activePluginChannelId: isDeletingCurrent ? undefined : state.activePluginChannelId,
        selectedProviderId: isDeletingCurrent ? fallbackId : state.selectedProviderId,
        pluginChannels: {
          ...state.pluginChannels,
          [activeEngine]: nextChannels,
        },
        sessionChannels: state.sessionChannels
          ? Object.fromEntries(
              Object.entries(state.sessionChannels).filter(
                ([, rec]) => !(rec.activePluginChannelId === channelId && rec.selectedCli === activeEngine),
              ),
            )
          : undefined,
      };
      await deleteCustomPluginChannel(activeEngine, channelId);
      if (isDeletingCurrent) {
        await applyChannelSelectionToHost({ engine: activeEngine, providerId: fallbackId });
        setCurrentChannelId(fallbackId);
      }
      await onSave(nextState);
      setState(nextState);
      await loadChannels(activeEngine);
      setStatusMsg("已删除该渠道");
    } catch (e) {
      setStatusMsg(`删除渠道失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      selectionPending.current = false;
      setSwitching(false);
    }
    setTimeout(() => setStatusMsg(null), 1500);
  };

  const handleEditHostChannel = async (ch: SystemProviderChannel, e: React.MouseEvent) => {
    e.stopPropagation();
    setViewingChannelId(null);
    setEditingChannelSource("host");
    setEditingChannelId(ch.id);
    setChannelForm({
      name: ch.name,
      baseUrl: ch.baseUrl || "",
      apiKey: ch.apiKey || "",
      model: ch.model || "",
      api: isPiFamilyApiProtocol(ch.api || "") ? ch.api! : DEFAULT_PI_FAMILY_API,
      enableEffortLevel: readEnableEffortLevel(ch),
    });
    setShowAddChannel(true);
  };

  const handleDeleteHostChannel = async (channelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy || fetchingModels || selectionPending.current) return;
    const error = sessionSelectionError(activeEngine);
    if (error) { setStatusMsg(error); return; }

    const channel = allSystemChannels.find((c) => c.id === channelId);
    if (!channel) return;

    setPendingDeleteChannel({ id: channelId, name: channel.name, source: "host" });
  };

  const confirmDeleteHostChannel = async (channelId: string) => {
    const isDeletingCurrent = state.activeChannelType !== "plugin" && state.selectedProviderId === channelId;

    selectionPending.current = true;
    setSwitching(true);
    try {
      const fallbackId = NATIVE_PROVIDER_ID;
      const nextState: PluginState = {
        ...state,
        selectedProviderId: isDeletingCurrent ? fallbackId : state.selectedProviderId,
        sessionChannels: state.sessionChannels
          ? Object.fromEntries(
              Object.entries(state.sessionChannels).filter(
                ([, rec]) => !(rec.selectedProviderId === channelId && rec.selectedCli === activeEngine),
              ),
            )
          : undefined,
      };
      await deleteHostProviderChannel(activeEngine, channelId);
      if (isDeletingCurrent) {
        await applyChannelSelectionToHost({ engine: activeEngine, providerId: fallbackId });
        setCurrentChannelId(fallbackId);
      }
      await onSave(nextState);
      setState(nextState);
      await loadChannels(activeEngine);
      setStatusMsg("已删除该渠道");
    } catch (e) {
      setStatusMsg(`删除渠道失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      selectionPending.current = false;
      setSwitching(false);
    }
    setTimeout(() => setStatusMsg(null), 1500);
  };

  const closeChannelForm = () => {
    setShowAddChannel(false);
    setEditingChannelId(null);
    setEditingChannelSource(null);
    setViewingChannelId(null);
    setChannelForm({ ...EMPTY_CHANNEL_FORM });
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
    setState((prev) => ({ ...prev, selectedCli: item.id, selectedModel: "", selectedProviderId: "", activeChannelType: "system", activePluginChannelId: undefined }));
  };

  const currentEngineObj = engines.find((e) => e.id === activeEngine);
  const engineHeader = currentEngineObj?.label ?? activeEngine;

  const channelBrand = (name: string, model?: string, url?: string, isNative?: boolean) => {
    if (isNative || name === "CLI 原生配置") return activeEngine;
    return inferModelEngine(name) || inferModelEngine(model || "") || inferModelEngine(url || "") || activeEngine;
  };

  return (
    <dialog
      ref={menuRef}
      open
      className="ms-flyout"
      aria-label="模型与渠道"
      aria-busy={busy}
      style={{
        transform: menuLayout.offsetX ? `translateX(${menuLayout.offsetX}px)` : undefined,
        maxHeight: `${menuLayout.maxHeight}px`,
        top: menuLayout.below ? "calc(100% + 8px)" : undefined,
        bottom: menuLayout.below ? "auto" : "calc(100% + 8px)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{flyoutStyles}</style>
      <div className="ms-content">
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
              enableTheme={state.enableTheme !== false}
              onToggleTheme={async (enabled) => {
                await onSave({ ...state, enableTheme: enabled });
                if (enabled) {
                  themeManager.apply();
                } else {
                  themeManager.dispose();
                }
                window.location.reload();
              }}
            />
          </div>
        ) : (
          <div className="ms-body">
              <ChannelSection
                channelSupportError={independentChannelError(activeEngine)}
                channelTab={channelTab}
                onTabChange={(tab) => {
                  if (tab !== channelTab) closeChannelForm();
                  setChannelTab(tab);
                }}
                systemChannels={sortedSystemChannels}
                pluginCustomChannels={sortedPluginChannels}
                loadingChannels={loadingChannels}
                fetchingModels={fetchingModels}
                selectedChannelId={state.activeChannelType === "plugin" ? state.activePluginChannelId ?? null : state.selectedProviderId || currentChannelId || activeChannel?.id || null}
                isPluginActive={state.activeChannelType === "plugin"}
                showAddChannel={showAddChannel}
                showProtocol={activeEngine === "omp" || activeEngine === "pi"}
                showEffortLevelToggle={activeEngine === "claude"}
                onToggleAddChannel={() => {
                  if (showAddChannel) closeChannelForm();
                  else {
                    setViewingChannelId(null);
                    setEditingChannelId(null);
                    setEditingChannelSource(null);
                    setChannelForm({ ...EMPTY_CHANNEL_FORM });
                    setShowAddChannel(true);
                  }
                }}
                onCloseForm={closeChannelForm}
                channelForm={channelForm}
                onFormChange={setChannelForm}
                editingChannelId={editingChannelId}
                viewingChannelId={viewingChannelId}
                onSaveChannel={() => void handleSaveNewChannel()}
                onSelectSystemProvider={(ch) => void handleSelectSystemProvider(ch)}
                onSelectPluginChannel={(ch) => void handleSelectPluginChannel(ch)}
                onViewSystemChannel={(ch, e) => {
                  e.stopPropagation();
                  setEditingChannelId(null);
                  setEditingChannelSource(null);
                  setViewingChannelId(ch.id);
                  setChannelForm({
                    name: ch.name,
                    baseUrl: ch.baseUrl || "",
                    apiKey: ch.apiKey || "",
                    model: ch.model || "",
                    api: isPiFamilyApiProtocol(ch.api || "") ? ch.api! : DEFAULT_PI_FAMILY_API,
                    enableEffortLevel: readEnableEffortLevel(ch),
                  });
                  setChannelTab("system");
                  setShowAddChannel(true);
                }}
                onEditPluginChannel={(ch, e) => {
                  e.stopPropagation();
                  setViewingChannelId(null);
                  setEditingChannelSource("plugin");
                  setEditingChannelId(ch.id);
                  setChannelForm({
                    name: ch.name,
                    baseUrl: ch.baseUrl,
                    apiKey: ch.apiKey,
                    model: ch.model || "",
                    api: isPiFamilyApiProtocol(ch.api || "") ? ch.api! : DEFAULT_PI_FAMILY_API,
                    enableEffortLevel: ch.enableEffortLevel || false,
                  });
                  setChannelTab("plugin");
                  setShowAddChannel(true);
                }}
                onDeletePluginChannel={(id, e) => void handleDeletePluginChannel(id, e)}
                onEditHostChannel={(ch, e) => void handleEditHostChannel(ch, e)}
                onDeleteHostChannel={(id, e) => void handleDeleteHostChannel(id, e)}
                channelBrand={channelBrand}
              >
                {activeEngine === "claude" ? <ScrubSection ctx={ctx} activeEngine={activeEngine} /> : null}
              </ChannelSection>

            <ModelListSection
              activeEngine={activeEngine}
              activeChannel={activeChannel}
              favoriteModelOptions={favoriteModelOptions}
              catalogModelOptions={catalogModelOptions}
              onAddFavorite={(id) => {
                if (catalogModelOptions.some(model => model.id === id)) void handleAddCustomModel(id);
              }}
              bareSelectedModel={bareSelectedModel}
              fetchingModels={fetchingModels}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onFetchModels={() => void handleFetchModels()}
              onSearchFocus={handleSearchFocus}
              selectionError={selectionError}
              onSelectModel={(id) => void handleSelectModel(id)}
              onDeleteCustomModel={(id, event) => {
                event.stopPropagation();
                if (!activeChannel || busy || fetchingModels) return;
                setPendingDeleteModel(id);
              }}
              customInput={customInput}
              onCustomInputChange={setCustomInput}
              onAddCustomModel={() => void handleAddCustomModel()}
              effort={state.effort || "high"}
              onEffortChange={handleEffortChange}
              enable1M={Boolean(state.enable1MContext)}
              onToggle1M={(enabled) => void handleToggle1M(enabled)}
            />
          </div>
        )}

        {statusMsg && (
          <div className="ms-status" role="status">
            {statusMsg}
          </div>
        )}

        {pendingDeleteModel && (
          <div className="ms-confirm-backdrop" role="presentation">
            <dialog
              open
              className="ms-confirm-dialog"
              aria-labelledby="ms-delete-title"
            >
              <h3 id="ms-delete-title">移出自选</h3>
              <p>确定将"{pendingDeleteModel}"移出自选吗？之后可以重新添加。</p>
              <div className="ms-confirm-actions">
                <button type="button" className="ms-button" onClick={() => setPendingDeleteModel(null)}>
                  取消
                </button>
                <button
                  type="button"
                  className="ms-button ms-danger"
                  onClick={() => void confirmDeleteCustomModel()}
                >
                  确认移出
                </button>
              </div>
            </dialog>
          </div>
        )}

        {pendingDeleteChannel && (
          <div className="ms-confirm-backdrop" role="presentation">
            <dialog
              open
              className="ms-confirm-dialog"
              aria-labelledby="ms-delete-channel-title"
            >
              <h3 id="ms-delete-channel-title">确认删除渠道</h3>
              <p>确定要删除渠道「{pendingDeleteChannel.name}」吗？</p>
              <p className="ms-warning-text">该操作不可撤销。</p>
              <div className="ms-confirm-actions">
                <button
                  type="button"
                  className="ms-button"
                  onClick={() => setPendingDeleteChannel(null)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="ms-button ms-danger"
                  onClick={() => void confirmDeleteChannel()}
                >
                  删除
                </button>
              </div>
            </dialog>
          </div>
        )}

        <div
          className="ms-engines"
          role="group"
          aria-label="CLI 引擎"
          ref={(el) => {
            if (el) {
              const handleWheel = (e: WheelEvent) => {
                if (e.deltaY !== 0) {
                  e.preventDefault();
                  el.scrollLeft += e.deltaY;
                }
              };
              el.addEventListener('wheel', handleWheel, { passive: false });
              return () => el.removeEventListener('wheel', handleWheel);
            }
          }}
        >
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
                {item.id === state.selectedCli && item.available ? <span aria-hidden className="ms-online" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {busy && (
        <div className="ms-loading-overlay" role="status" aria-live="polite">
          <RefreshIcon size={26} className="animate-spin" />
          <span>正在应用配置…</span>
        </div>
      )}
    </dialog>
  );
}
