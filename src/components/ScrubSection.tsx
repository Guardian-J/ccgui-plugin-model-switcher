import { React, useState, useEffect, useRef } from "../react-context";
import type { PluginContext } from "../ccgui-plugin";
import {
  checkScrubStatus,
  applyScrubPrompt,
  restoreOfficialPrompt,
  type ScrubStatus,
} from "../prompt-scrubber";
import { RefreshIcon } from "../icons";
import { isRemoteHost } from "../host-transport";

const ICON_BTN = "ms-icon-button";

interface ScrubSectionProps {
  ctx: PluginContext;
  activeEngine: string;
}

export function ScrubSection({ ctx, activeEngine }: ScrubSectionProps) {
  const [scrubStatus, setScrubStatus] = useState<ScrubStatus>("unknown");
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubMessage, setScrubMessage] = useState("");
  const scrubPending = useRef(false);
  const scrubRequest = useRef(0);

  useEffect(() => {
    setScrubStatus("unknown");
    setScrubMessage("");
    scrubPending.current = false;
    setScrubbing(false);
    return () => {
      scrubRequest.current++;
    };
  }, [activeEngine, ctx]);

  const runScrubAction = async (action: "check" | "apply" | "restore") => {
    if (scrubPending.current) return;
    scrubPending.current = true;
    const request = ++scrubRequest.current;
    setScrubbing(true);
    setScrubStatus("unknown");
    setScrubMessage("");
    try {
      const result =
        action === "apply"
          ? await applyScrubPrompt(ctx)
          : action === "restore"
            ? await restoreOfficialPrompt(ctx)
            : null;
      const checked = await checkScrubStatus(ctx);
      if (request !== scrubRequest.current) return;
      setScrubStatus(checked.status);
      setScrubMessage(
        result ? `${result.message}\n${checked.message || ""}` : checked.message || "",
      );
    } catch (error) {
      if (request === scrubRequest.current) {
        setScrubMessage(error instanceof Error ? error.message : "检测失败");
      }
    } finally {
      if (request === scrubRequest.current) {
        scrubPending.current = false;
        setScrubbing(false);
      }
    }
  };

  if (isRemoteHost()) return <section className="ms-scrub"><h3>提示词清洗</h3><p className="ms-muted">此操作需要在桌面端执行。</p></section>;
  return (
    <section className="ms-scrub" aria-label="提示词清洗" aria-busy={scrubbing}>
      <div className="ms-scrub-heading">
        <h3>提示词清洗</h3>
        <button
          type="button"
          className={ICON_BTN}
          disabled={scrubbing}
          onClick={() => void runScrubAction("check")}
          aria-label="重新检测清洗状态"
          title="重新检测清洗状态"
        >
          <RefreshIcon size={14} className={scrubbing ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="ms-scrub-controls">
        <span className="ms-scrub-state" data-state={scrubStatus} role="status">
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
              onClick={() => void runScrubAction("apply")}
              className="ms-button"
            >
              {scrubbing ? "…" : "清洗"}
            </button>
          ) : scrubStatus === "clean" ? (
            <button
              type="button"
              disabled={scrubbing}
              onClick={() => void runScrubAction("restore")}
              className="ms-button"
            >
              恢复
            </button>
          ) : (
            <button
              type="button"
              disabled={scrubbing}
              onClick={() => void runScrubAction("check")}
              className="ms-button"
            >
              {scrubbing ? "…" : "检测"}
            </button>
          )}
        </span>
      </div>
      {scrubMessage ? (
        <p className="ms-scrub-message" role="status">
          {scrubMessage}
        </p>
      ) : null}
    </section>
  );
}
