import { React, useEffect, useMemo, useRef, useState } from "../react-context";
import type { CliEngineId, EffortLevel } from "../types";
import { FlameOverlay } from "./EffortFlame";

export const EFFORT_LEVELS: readonly EffortLevel[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
];

interface Props {
  engine: CliEngineId;
  effort: EffortLevel;
  onChange: (level: EffortLevel) => boolean | void | Promise<boolean | void>;
  disabled?: boolean;
  enable1M: boolean;
  onToggle1M: (enabled: boolean) => void;
}

export function EffortSection({
  engine,
  effort,
  onChange,
  disabled = false,
  enable1M,
  onToggle1M,
}: Props) {
  const savedIndex = Math.max(0, EFFORT_LEVELS.indexOf(effort));
  const [preview, setPreview] = useState<number | null>(null);
  const draft = useRef(savedIndex);
  const pointer = useRef<number | null>(null);
  const keyboard = useRef(false);
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const position = preview ?? savedIndex;
  const index = Math.round(position);
  const fraction = position / (EFFORT_LEVELS.length - 1);
  const dragging = pointer.current !== null;
  const isMax = index === EFFORT_LEVELS.length - 1 && !dragging && !keyboard.current && !pending;
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const updateVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);
  useEffect(() => {
    if (!saving.current && pointer.current === null && !keyboard.current) {
      draft.current = savedIndex;
      setPreview(null);
    }
  }, [savedIndex]);
  const updatePreview = (value: number) => {
    draft.current = value;
    setPreview(value);
  };
  const cancelPreview = () => {
    pointer.current = null;
    keyboard.current = false;
    draft.current = savedIndex;
    setPreview(null);
  };
  const commit = async () => {
    if (saving.current) return;
    const next = Math.round(draft.current);
    if (disabled || next === savedIndex) { cancelPreview(); return; }
    updatePreview(next);
    setSaveError(null);
    saving.current = true;
    setPending(true);
    try {
      // Only the final stop reaches host IPC/storage; the parent reports save failures.
      await onChange(EFFORT_LEVELS[next]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "推理强度保存失败，请重试");
    } finally {
      saving.current = false;
      setPending(false);
      setPreview(null);
    }
  };
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const blast = useMemo(() => EFFORT_LEVELS.map(() => ({
    x: -(70 + Math.random() * 130), y: (Math.random() - 0.5) * 70,
    rotate: (Math.random() - 0.5) * 720, delay: Math.random() * 0.3,
  })), [isMax]);

  return (
    <div className="ms-effort" data-dragging={dragging || keyboard.current || undefined}>
      <div className="ms-effort-heading">
        <span className="ms-effort-label">
          推理强度 <output key={EFFORT_LEVELS[index]}>{EFFORT_LEVELS[index]}</output>
        </span>
        <button
          type="button"
          role="switch"
          aria-label="1M 上下文"
          aria-checked={engine === "claude" && enable1M}
          disabled={engine !== "claude" || disabled || pending}
          title={engine === "claude" ? "1M 上下文（需要模型支持）" : "上下文容量由 CLI 和模型配置决定，不支持通过此开关开启 1M"}
          onClick={() => onToggle1M(!enable1M)}
          className="ms-switch-button"
        >
          <span>{engine === "claude" ? "1M 上下文" : "原生上下文"}</span>
          <span aria-hidden className="ms-switch">
            <span />
          </span>
        </button>
      </div>
      <div className="ms-range-labels">
        <span>更快</span>
        <span>更深入</span>
      </div>
      <div className="ms-effort-slider">
        <div className="ms-effort-track" data-max={isMax && !reducedMotion || undefined}>
          <div
            className="ms-effort-fill"
            style={{ width: `calc(${fraction} * (100% - 21px) + 21px)` }}
          />
          <div className="ms-effort-ticks" aria-hidden>
            {EFFORT_LEVELS.map((level, i) => (
              <span key={level} style={{
                opacity: isMax && !reducedMotion ? 0 : i > index ? 0.3 : 1,
                transform: isMax && !reducedMotion ? `translate(${blast[i].x}px, ${blast[i].y}px) rotate(${blast[i].rotate}deg)` : "none",
                transitionDelay: isMax && !reducedMotion ? `${blast[i].delay}s` : "0s",
              }} />
            ))}
          </div>
          {isMax && !reducedMotion && visible && <FlameOverlay />}
          <input
            className="ms-range"
            type="range"
            min={0}
            max={EFFORT_LEVELS.length - 1}
            step={0.01}
            value={position}
            disabled={disabled || pending}
            aria-label="推理强度"
            aria-valuetext={EFFORT_LEVELS[index]}
            onPointerDown={(e) => {
              if (e.button !== 0 || saving.current || disabled) return;
              pointer.current = e.pointerId;
              updatePreview(position);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerUp={(e) => {
              if (pointer.current !== e.pointerId) return;
              pointer.current = null;
              void commit();
            }}
            onPointerCancel={cancelPreview}
            onLostPointerCapture={() => { if (pointer.current !== null) cancelPreview(); }}
            onKeyDown={(e) => {
              const changes: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -1, PageUp: 1 };
              if (!(e.key in changes) && e.key !== "Home" && e.key !== "End") return;
              e.preventDefault();
              if (!keyboard.current) draft.current = position;
              keyboard.current = true;
              updatePreview(e.key === "Home" ? 0 : e.key === "End" ? EFFORT_LEVELS.length - 1
                : Math.max(0, Math.min(EFFORT_LEVELS.length - 1, Math.round(draft.current) + changes[e.key])));
            }}
            onKeyUp={() => { if (keyboard.current) { keyboard.current = false; void commit(); } }}
            onBlur={() => {
              if (pointer.current !== null) cancelPreview();
              else if (keyboard.current) { keyboard.current = false; void commit(); }
            }}
            onChange={(e) => {
              updatePreview(Number(e.target.value));
              if (pointer.current === null && !keyboard.current) void commit();
            }}
          />
        </div>
      </div>
      {saveError && <div role="alert">{saveError}</div>}
    </div>
  );
}
