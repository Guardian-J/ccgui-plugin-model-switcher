import { React } from "../react-context";
import type { EffortLevel } from "../types";
import { EFFORT_LEVELS } from "./EffortSection";
import { FlameOverlay } from "./EffortFlame";

interface EffortSliderProps {
  position: number;
  savedIndex: number;
  disabled: boolean;
  pending: boolean;
  isMax: boolean;
  reducedMotion: boolean;
  visible: boolean;
  blast: Array<{ x: number; y: number; rotate: number; delay: number }>;
  onUpdatePreview: (value: number) => void;
  onCommit: () => Promise<void>;
  onCancel: () => void;
  pointerRef: React.MutableRefObject<number | null>;
  keyboardRef: React.MutableRefObject<boolean>;
  savingRef: React.MutableRefObject<boolean>;
  draftRef: React.MutableRefObject<number>;
}

export function EffortSlider({
  position,
  savedIndex,
  disabled,
  pending,
  isMax,
  reducedMotion,
  visible,
  blast,
  onUpdatePreview,
  onCommit,
  onCancel,
  pointerRef,
  keyboardRef,
  savingRef,
  draftRef,
}: EffortSliderProps) {
  const index = Math.round(position);
  const fraction = position / (EFFORT_LEVELS.length - 1);
  const dragging = pointerRef.current !== null;

  const handlePointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    if (e.button !== 0 || savingRef.current || disabled) return;
    pointerRef.current = e.pointerId;
    onUpdatePreview(position);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLInputElement>) => {
    if (pointerRef.current !== e.pointerId) return;
    pointerRef.current = null;
    void onCommit();
  };

  const handleLostPointerCapture = () => {
    if (pointerRef.current !== null) onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const changes: Record<string, number> = {
      ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -1, PageUp: 1
    };
    if (!(e.key in changes) && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    if (!keyboardRef.current) draftRef.current = position;
    keyboardRef.current = true;
    onUpdatePreview(
      e.key === "Home" ? 0 :
      e.key === "End" ? EFFORT_LEVELS.length - 1 :
      Math.max(0, Math.min(EFFORT_LEVELS.length - 1, Math.round(draftRef.current) + changes[e.key]))
    );
  };

  const handleKeyUp = () => {
    if (keyboardRef.current) {
      keyboardRef.current = false;
      void onCommit();
    }
  };

  const handleBlur = () => {
    if (pointerRef.current !== null) {
      onCancel();
    } else if (keyboardRef.current) {
      keyboardRef.current = false;
      void onCommit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdatePreview(Number(e.target.value));
    if (pointerRef.current === null && !keyboardRef.current) void onCommit();
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
          disabled={disabled}
          aria-label="推理强度"
          aria-valuetext={EFFORT_LEVELS[index]}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={onCancel}
          onLostPointerCapture={handleLostPointerCapture}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onBlur={handleBlur}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
