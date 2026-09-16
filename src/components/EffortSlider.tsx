import { React, useRef, useState } from "../react-context";
import type { EffortLevel } from "../types";

const EFFORT_LEVELS: readonly EffortLevel[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
];

interface EffortSliderProps {
  savedIndex: number;
  disabled: boolean;
  pending: boolean;
  isMax: boolean;
  reducedMotion: boolean;
  visible: boolean;
  blast: Array<{ x: number; y: number; rotate: number; delay: number }>;
  onCommit: () => Promise<void>;
  onUpdatePreview: (value: number) => void;
  onCancelPreview: () => void;
}

export function EffortSlider({
  savedIndex,
  disabled,
  pending,
  isMax,
  reducedMotion,
  visible,
  blast,
  onCommit,
  onUpdatePreview,
  onCancelPreview,
}: EffortSliderProps) {
  const [preview, setPreview] = useState<number | null>(null);
  const draft = useRef(savedIndex);
  const pointer = useRef<number | null>(null);
  const keyboard = useRef(false);
  const saving = useRef(false);

  const position = preview ?? savedIndex;
  const index = Math.round(position);
  const fraction = position / (EFFORT_LEVELS.length - 1);
  const dragging = pointer.current !== null;

  const updatePreview = (value: number) => {
    draft.current = value;
    setPreview(value);
    onUpdatePreview(value);
  };

  const cancelPreview = () => {
    pointer.current = null;
    keyboard.current = false;
    draft.current = savedIndex;
    setPreview(null);
    onCancelPreview();
  };

  const commit = async () => {
    if (saving.current) return;
    const next = Math.round(draft.current);
    if (disabled || next === savedIndex) {
      cancelPreview();
      return;
    }
    updatePreview(next);
    saving.current = true;
    try {
      await onCommit();
    } finally {
      saving.current = false;
      setPreview(null);
    }
  };

  return (
    <div className="ms-effort-slider">
      <div className="ms-effort-track" data-max={isMax && !reducedMotion || undefined}>
        <div
          className="ms-effort-fill"
          style={{ width: `calc(${fraction} * (100% - 21px) + 21px)` }}
        />
        <div className="ms-effort-ticks" aria-hidden>
          {EFFORT_LEVELS.map((level, i) => (
            <span
              key={level}
              style={{
                opacity: isMax && !reducedMotion ? 0 : i > index ? 0.3 : 1,
                transform:
                  isMax && !reducedMotion
                    ? `translate(${blast[i].x}px, ${blast[i].y}px) rotate(${blast[i].rotate}deg)`
                    : "none",
                transitionDelay: isMax && !reducedMotion ? `${blast[i].delay}s` : "0s",
              }}
            />
          ))}
        </div>
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
          onLostPointerCapture={() => {
            if (pointer.current !== null) cancelPreview();
          }}
          onKeyDown={(e) => {
            const changes: Record<string, number> = {
              ArrowLeft: -1,
              ArrowDown: -1,
              ArrowRight: 1,
              ArrowUp: 1,
              PageDown: -1,
              PageUp: 1,
            };
            if (!(e.key in changes) && e.key !== "Home" && e.key !== "End") return;
            e.preventDefault();
            if (!keyboard.current) draft.current = position;
            keyboard.current = true;
            updatePreview(
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? EFFORT_LEVELS.length - 1
                  : Math.max(
                      0,
                      Math.min(EFFORT_LEVELS.length - 1, Math.round(draft.current) + changes[e.key])
                    )
            );
          }}
          onKeyUp={() => {
            if (keyboard.current) {
              keyboard.current = false;
              void commit();
            }
          }}
          onBlur={() => {
            if (pointer.current !== null) cancelPreview();
            else if (keyboard.current) {
              keyboard.current = false;
              void commit();
            }
          }}
          onChange={(e) => {
            updatePreview(Number(e.target.value));
            if (pointer.current === null && !keyboard.current) void commit();
          }}
        />
      </div>
    </div>
  );
}
