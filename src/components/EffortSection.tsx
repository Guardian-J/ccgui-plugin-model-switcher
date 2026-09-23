import { React, useEffect, useMemo, useRef, useState } from "../react-context";
import type { EffortLevel } from "../types";
import { EffortSlider } from "./EffortSlider";

export const EFFORT_LEVELS: readonly EffortLevel[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
];

interface Props {
  effort: EffortLevel;
  onChange: (level: EffortLevel) => boolean | void | Promise<boolean | void>;
  disabled?: boolean;
  enable1M: boolean;
  onToggle1M: (enabled: boolean) => void;
}

function useEffortState(effort: EffortLevel, disabled: boolean) {
  const savedIndex = Math.max(0, EFFORT_LEVELS.indexOf(effort));
  const [preview, setPreview] = useState<number | null>(null);
  const draft = useRef(savedIndex);
  const pointer = useRef<number | null>(null);
  const keyboard = useRef(false);
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!saving.current && pointer.current === null && !keyboard.current) {
      draft.current = savedIndex;
      setPreview(null);
    }
  }, [savedIndex]);

  return {
    savedIndex,
    preview,
    draft,
    pointer,
    keyboard,
    saving,
    pending,
    saveError,
    setPreview,
    setPending,
    setSaveError,
  };
}

function useMediaQueries() {
  const [reducedMotion, setReducedMotion] = useState(() =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
  const [visible, setVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const updateVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return { reducedMotion, visible };
}

export function EffortSection({
  effort,
  onChange,
  disabled = false,
  enable1M,
  onToggle1M,
}: Props) {
  const state = useEffortState(effort, disabled);
  const { reducedMotion, visible } = useMediaQueries();

  const position = state.preview ?? state.savedIndex;
  const index = Math.round(position);
  const dragging = state.pointer.current !== null;
  const isMax = index === EFFORT_LEVELS.length - 1 && !dragging && !state.keyboard.current && !state.pending;

  const blast = useMemo(() => EFFORT_LEVELS.map(() => ({
    x: -(70 + Math.random() * 130),
    y: (Math.random() - 0.5) * 70,
    rotate: (Math.random() - 0.5) * 720,
    delay: Math.random() * 0.3,
  })), [isMax]);

  const updatePreview = (value: number) => {
    state.draft.current = value;
    state.setPreview(value);
  };

  const cancelPreview = () => {
    state.pointer.current = null;
    state.keyboard.current = false;
    state.draft.current = state.savedIndex;
    state.setPreview(null);
  };

  const commit = async () => {
    if (state.saving.current) return;
    const next = Math.round(state.draft.current);
    if (disabled || next === state.savedIndex) {
      cancelPreview();
      return;
    }
    updatePreview(next);
    state.setSaveError(null);
    state.saving.current = true;
    state.setPending(true);
    try {
      await onChange(EFFORT_LEVELS[next]);
    } catch (error) {
      state.setSaveError(error instanceof Error ? error.message : "推理强度保存失败，请重试");
    } finally {
      state.saving.current = false;
      state.setPending(false);
      state.setPreview(null);
    }
  };

  return (
    <div className="ms-effort" data-dragging={dragging || state.keyboard.current || undefined}>
      <div className="ms-effort-heading">
        <span className="ms-effort-label">
          推理强度 <output key={EFFORT_LEVELS[index]}>{EFFORT_LEVELS[index]}</output>
        </span>
        <button
          type="button"
          role="switch"
          aria-label="1M 上下文"
          aria-checked={enable1M}
          disabled={disabled || state.pending}
          title="1M 上下文（需要模型支持）"
          onClick={() => onToggle1M(!enable1M)}
          className="ms-switch-button"
        >
          <span>1M 上下文</span>
          <span aria-hidden className="ms-switch">
            <span />
          </span>
        </button>
      </div>
      <div className="ms-range-labels">
        <span>更快</span>
        <span>更深入</span>
      </div>
      <EffortSlider
        position={position}
        savedIndex={state.savedIndex}
        disabled={disabled}
        pending={state.pending}
        isMax={isMax}
        reducedMotion={reducedMotion}
        visible={visible}
        blast={blast}
        onUpdatePreview={updatePreview}
        onCommit={commit}
        onCancel={cancelPreview}
        pointerRef={state.pointer}
        keyboardRef={state.keyboard}
        savingRef={state.saving}
        draftRef={state.draft}
      />
      {state.saveError && <div role="alert">{state.saveError}</div>}
    </div>
  );
}
