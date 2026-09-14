import { React } from "../react-context";
import type { CliEngineId, EffortLevel } from "../types";

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
  onChange: (level: EffortLevel) => void;
  enable1M: boolean;
  onToggle1M: (enabled: boolean) => void;
}

export function EffortSection({
  engine,
  effort,
  onChange,
  enable1M,
  onToggle1M,
}: Props) {
  const index = Math.max(0, EFFORT_LEVELS.indexOf(effort));
  const fraction = index / (EFFORT_LEVELS.length - 1);

  return (
    <div className="ms-effort">
      <div className="ms-effort-heading">
        <span className="ms-effort-label">
          推理强度 <output>{effort}</output>
        </span>
        <button
          type="button"
          role="switch"
          aria-label="1M 上下文"
          aria-checked={engine === "claude" && enable1M}
          disabled={engine !== "claude"}
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
      <div className="ms-effort-track">
        <div
          className="ms-effort-fill"
          style={{ width: `calc(${fraction} * (100% - 21px) + 21px)` }}
        />
        <div className="ms-effort-ticks" aria-hidden>
          {EFFORT_LEVELS.map((level, i) => (
            <span key={level} style={{ opacity: i > index ? 0.3 : 1 }} />
          ))}
        </div>
        <input
          className="ms-range"
          type="range"
          min={0}
          max={EFFORT_LEVELS.length - 1}
          step={1}
          value={index}
          aria-label="推理强度"
          aria-valuetext={effort}
          onChange={(e) => onChange(EFFORT_LEVELS[Number(e.target.value)])}
        />
      </div>
    </div>
  );
}
