import { React } from "./react-context";
import claudeIcon from "./assets/model-icons/claude.svg";
import deepseekIcon from "./assets/model-icons/deepseek.svg";
import chatglmIcon from "./assets/model-icons/chatglm.svg";
import qwenIcon from "./assets/model-icons/qwen.svg";
import doubaoIcon from "./assets/model-icons/doubao.svg";
import minimaxIcon from "./assets/model-icons/minimax.svg";
import yiIcon from "./assets/model-icons/yi.svg";
import baichuanIcon from "./assets/model-icons/baichuan.svg";
import hunyuanIcon from "./assets/model-icons/hunyuan.svg";
import stepfunIcon from "./assets/model-icons/stepfun.svg";
import geminiIcon from "./assets/model-icons/gemini.svg";
import mistralIcon from "./assets/model-icons/mistral.svg";
import cohereIcon from "./assets/model-icons/cohere.svg";
import perplexityIcon from "./assets/model-icons/perplexity.svg";

/**
 * CLI Engine Icons
 *
 * 这些 icon 实现派生自宿主的标准实现：
 * - 宿主路径：src/components/foundations/icons/engine-icon.tsx
 * - 宿主品牌定义：src/components/foundations/icons/engine-brands.ts
 *
 * 由于插件 SDK 不支持直接导入宿主基础组件，插件维护了这份副本。
 * 当宿主添加新 CLI 或更新 logo 时，应同步更新此文件。
 *
 * 注意：这是技术限制的权宜之计，理想情况下应从宿主 SDK 统一获取。
 */

interface IconProps {
  size?: number;
  className?: string;
}

export function SearchIcon({ size = 14, className = "text-foreground-icon-secondary" }: IconProps) {
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
      className={className}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function RefreshIcon({ size = 14, className = "text-foreground-icon-secondary" }: IconProps) {
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
      className={className}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

export function CheckIcon({ size = 16, className = "text-foreground-icon-primary" }: IconProps) {
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
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 16, className = "text-foreground-icon-secondary" }: IconProps) {
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
      className={className}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 14, className = "text-foreground-icon-secondary" }: IconProps) {
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
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function PaletteIcon({ size = 14, className = "text-foreground-icon-secondary" }: IconProps) {
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
      className={className}
    >
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  );
}

export function GlobeIcon({ size = 14, className = "text-foreground-icon-secondary" }: IconProps) {
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
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

export function PlusIcon({ size = 14, className = "text-foreground-icon-secondary" }: IconProps) {
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
      className={className}
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

export function TrashIcon({ size = 14, className = "text-foreground-icon-secondary" }: IconProps) {
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
      className={className}
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

/** 查看明文（API Key 等敏感字段） */
export function EyeIcon({ size = 14, className = "text-foreground-icon-secondary" }: IconProps) {
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
      className={className}
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** 隐藏明文，切回掩码显示 */
export function EyeOffIcon({ size = 14, className = "text-foreground-icon-secondary" }: IconProps) {
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
      className={className}
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
      <path d="M9.9 5.2A10.9 10.9 0 0 1 12 5c7 0 10 7 10 7a13.3 13.3 0 0 1-1.7 2.5" />
      <path d="M6.6 6.6A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6" />
    </svg>
  );
}

const CLAUDE_PATH =
  "M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z";

const OPENAI_PATH =
  "M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 0 0-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 0 1 .476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 0 1 4.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 0 1-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 0 0 5.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0 0 10.205 0a5.947 5.947 0 0 0-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 0 0 4.162 1.713z";

const DEEPSEEK_PATH =
  "M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z";

const DOUBAO_PATHS = [
  "M5.31 15.756c.172-3.75 1.883-5.999 2.549-6.739-3.26 2.058-5.425 5.658-6.358 8.308v1.12C1.501 21.513 4.226 24 7.59 24a6.59 6.59 0 002.2-.375c.353-.12.7-.248 1.039-.378.913-.899 1.65-1.91 2.243-2.992-4.877 2.431-7.974.072-7.763-4.5l.002.001z",
  "M22.57 10.283c-1.212-.901-4.109-2.404-7.397-2.8.295 3.792.093 8.766-2.1 12.773a12.782 12.782 0 01-2.244 2.992c3.764-1.448 6.746-3.457 8.596-5.219 2.82-2.683 3.353-5.178 3.361-6.66a2.737 2.737 0 00-.216-1.084v-.002z",
  "M14.303 1.867C12.955.7 11.248 0 9.39 0 7.532 0 5.883.677 4.545 1.807 2.791 3.29 1.627 5.557 1.5 8.125v9.201c.932-2.65 3.097-6.25 6.357-8.307.5-.318 1.025-.595 1.569-.829 1.883-.801 3.878-.932 5.746-.706-.222-2.83-.718-5.002-.87-5.617h.001z",
  "M17.305 4.961a199.47 199.47 0 01-1.08-1.094c-.202-.213-.398-.419-.586-.622l-1.333-1.378c.151.615.648 2.786.869 5.617 3.288.395 6.185 1.898 7.396 2.8-1.306-1.275-3.475-3.487-5.266-5.323z",
] as const;
const DOUBAO_FILLS = ["#1E37FC", "#37E1BE", "#A569FF", "#1E37FC"] as const;

const MINIMAX_GRAD_ID = "plugin-minimax-grad";
const MINIMAX_PATH =
  "M16.278 2c1.156 0 2.093.927 2.093 2.07v12.501a.74.74 0 00.744.709.74.74 0 00.743-.709V9.099a2.06 2.06 0 012.071-2.049A2.06 2.06 0 0124 9.1v6.561a.649.649 0 01-.652.645.649.649 0 01-.653-.645V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v7.472a2.037 2.037 0 01-2.048 2.026 2.037 2.037 0 01-2.048-2.026v-12.5a.785.785 0 00-.788-.753.785.785 0 00-.789.752l-.001 15.904A2.037 2.037 0 0113.441 22a2.037 2.037 0 01-2.048-2.026V18.04c0-.356.292-.645.652-.645.36 0 .652.289.652.645v1.934c0 .263.142.506.372.638.23.131.514.131.744 0a.734.734 0 00.372-.638V4.07c0-1.143.937-2.07 2.093-2.07zm-5.674 0c1.156 0 2.093.927 2.093 2.07v11.523a.648.648 0 01-.652.645.648.648 0 01-.652-.645V4.07a.785.785 0 00-.789-.78.785.785 0 00-.789.78v14.013a2.06 2.06 0 01-2.07 2.048 2.06 2.06 0 01-2.071-2.048V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v3.8a2.06 2.06 0 01-2.071 2.049A2.06 2.06 0 010 12.9v-1.378c0-.357.292-.646.652-.646.36 0 .653.29.653.646V12.9c0 .418.343.757.766.757s.766-.339.766-.757V9.099a2.06 2.06 0 012.07-2.048 2.06 2.06 0 012.071 2.048v8.984c0 .419.343.758.767.758.423 0 .766-.339.766-.758V4.07c0-1.143.937-2.07 2.093-2.07z";

const YI_PATH =
  "M18.62 13.927c.611 0 1.107.505 1.107 1.128v5.817c0 .623-.496 1.128-1.108 1.128a1.118 1.118 0 01-1.108-1.128v-5.817c0-.623.496-1.128 1.108-1.128zM16.59 3.052a1.094 1.094 0 011.562-.129c.466.404.522 1.116.126 1.59l-5.938 7.111v9.147c0 .624-.496 1.129-1.108 1.129a1.118 1.118 0 01-1.108-1.129v-9.477l.003-.088.01-.087c.015-.232.102-.462.261-.654l6.192-7.413zM2.906 2.256a1.094 1.094 0 011.559.157l4.387 5.45a1.142 1.142 0 01-.155 1.587 1.094 1.094 0 01-1.559-.157l-4.387-5.45a1.144 1.144 0 01.06-1.498l.095-.09z";

const BAICHUAN_GRAD_ID = "plugin-baichuan-grad";
const BAICHUAN_PATH =
  "M7.333 2h-3.2l-2 4.333V17.8L0 22h5.2l2.028-4.2L7.333 2zm7.334 0h-5.2v20h5.2V2zM16.8 7.733H22V22h-5.2V7.733zM22 2h-5.2v4.133H22V2z";

const HUNYUAN_PATHS = [
  { d: "M12 0c.518 0 1.028.033 1.528.096A6.188 6.188 0 0112.12 12.28l-.12.001c-2.99 0-5.242 2.179-5.554 5.11-.223 2.086.353 4.412 2.242 6.146C3.672 22.1 0 17.479 0 12 0 5.373 5.373 0 12 0z", fill: "#A8DFF5" },
  { d: "M5.286 5a2.438 2.438 0 01.682 3.38c-3.962 5.966-3.215 10.743 2.648 15.136C3.636 22.056 0 17.452 0 12c0-1.787.39-3.482 1.09-5.006.253-.435.525-.872.817-1.311A2.438 2.438 0 015.286 5z", fill: "#0055E9" },
  { d: "M12.98.04c.272.021.543.053.81.093.583.106 1.117.254 1.538.44 6.638 2.927 8.07 10.052 1.748 15.642a4.125 4.125 0 01-5.822-.358c-1.51-1.706-1.3-4.184.357-5.822.858-.848 3.108-1.223 4.045-2.441 1.257-1.634 2.122-6.009-2.523-7.506L12.98.039z", fill: "#00BCFF" },
  { d: "M13.528.096A6.187 6.187 0 0112 12.281a5.75 5.75 0 00-1.71.255c.147-.905.595-1.784 1.321-2.501.858-.848 3.108-1.223 4.045-2.441 1.27-1.651 2.14-6.104-2.676-7.554.184.014.367.033.548.056z", fill: "#ECECEE" },
] as const;

const STEPFUN_GRAD_ID = "plugin-stepfun-grad";
const STEPFUN_PATH =
  "M22.012 0h1.032v.927H24v.968h-.956V3.78h-1.032V1.896h-1.878v-.97h1.878V0zM2.6 12.371V1.87h.969v10.502h-.97zm10.423.66h10.95v.918h-6.208v9.579h-4.742V13.03zM5.629 3.333v12.356H0v4.51h10.386V8L20.859 8l-.003-4.668-15.227.001z";

const MISTRAL_PATHS = [
  { d: "M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z", fill: "gold" },
  { d: "M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z", fill: "#FFAF00" },
  { d: "M3.428 10.258h17.144v3.428H3.428v-3.428z", fill: "#FF8205" },
  { d: "M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z", fill: "#FA500F" },
  { d: "M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z", fill: "#E10500" },
] as const;

const COHERE_PATHS = [
  { d: "M8.128 14.099c.592 0 1.77-.033 3.398-.703 1.897-.781 5.672-2.2 8.395-3.656 1.905-1.018 2.74-2.366 2.74-4.18A4.56 4.56 0 0018.1 1H7.549A6.55 6.55 0 001 7.55c0 3.617 2.745 6.549 7.128 6.549z", fill: "#39594D" },
  { d: "M9.912 18.61a4.387 4.387 0 012.705-4.052l3.323-1.38c3.361-1.394 7.06 1.076 7.06 4.715a5.104 5.104 0 01-5.105 5.104l-3.597-.001a4.386 4.386 0 01-4.386-4.387z", fill: "#D18EE2" },
  { d: "M4.776 14.962A3.775 3.775 0 001 18.738v.489a3.776 3.776 0 007.551 0v-.49a3.775 3.775 0 00-3.775-3.775z", fill: "#FF7759" },
] as const;

const PERPLEXITY_PATH =
  "M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z";

const KIMI_PATHS = [
  "M21.846 0a1.923 1.923 0 110 3.846H20.15a.226.226 0 01-.227-.226V1.923C19.923.861 20.784 0 21.846 0z",
  "M11.065 11.199l7.257-7.2c.137-.136.06-.41-.116-.41H14.3a.164.164 0 00-.117.051l-7.82 7.756c-.122.12-.302.013-.302-.179V3.82c0-.127-.083-.23-.185-.23H3.186c-.103 0-.186.103-.186.23V19.77c0 .128.083.23.186.23h2.69c.103 0 .186-.102.186-.23v-3.25c0-.069.025-.135.069-.178l2.424-2.406a.158.158 0 01.205-.023l6.484 4.772a7.677 7.677 0 003.453 1.283c.108.012.2-.095.2-.23v-3.06c0-.117-.07-.212-.164-.227a5.028 5.028 0 01-2.027-.807l-5.613-4.064c-.117-.078-.132-.279-.028-.381z",
];

const GROK_PATHS = [
  "M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815",
];

const PI_PATHS = [
  "M1 1h16.5v11H12v5.5H6.5V23H1V1zm5.5 5.5V12H12V6.5H6.5z",
  "M17.5 12H23v11h-5.5V12z",
];

const GEMINI_PATH =
  "M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z";

/**
 * 推断模型或渠道对应的品牌
 * 对应宿主的 inferModelEngine 函数（engine-brands.ts）
 */
export function inferModelEngine(name: string): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (
    lower.includes("claude") ||
    lower.includes("sonnet") ||
    lower.includes("opus") ||
    lower.includes("haiku") ||
    lower.includes("anthropic")
  ) {
    return "claude";
  }
  if (lower.includes("gemini") || lower.includes("google")) {
    return "gemini";
  }
  if (lower.includes("grok") || lower.includes("xai")) {
    return "grok";
  }
  if (lower.includes("deepseek") || lower.includes("dsh") || lower.includes("深度求索")) {
    return "dsh";
  }
  if (
    lower.includes("kimi") ||
    lower.includes("moonshot") ||
    lower.includes("月之暗面") ||
    /\bk\d/.test(lower)
  ) {
    return "kimi";
  }
  if (/\b(glm|chatglm|zhipu|智谱)\b/i.test(lower)) {
    return "chatglm";
  }
  if (/\b(qwen|tongyi|qwq|千问|通义)\b/i.test(lower)) {
    return "qwen";
  }
  if (
    lower.includes("gpt") ||
    lower.includes("codex") ||
    lower.includes("openai") ||
    lower.includes("chatgpt") ||
    /\bo[134]\b/.test(lower)
  ) {
    return "codex";
  }
  if (
    /\b(pi|inflection)\b/i.test(lower) ||
    /(^|[-_\s./])pi([-_.\s/]|$)/i.test(lower)
  ) {
    return "pi";
  }
  if (
    /\bomp\b/i.test(lower) ||
    /(^|[-_\s./])omp([-_.\s/]|$)/i.test(lower) ||
    lower.includes("oh-my-pi")
  ) {
    return "omp";
  }
  if (
    /\bagy\b/i.test(lower) ||
    /(^|[-_\s./])agy([-_.\s/]|$)/i.test(lower) ||
    lower.includes("antigravity")
  ) {
    return "agy";
  }
  return null;
}

/**
 * CLI Engine Icon 组件实现
 * 这些组件的 SVG path 和渲染逻辑与宿主保持一致
 */

function GeminiEngineIcon({ size, gradPrefix = "gemini" }: { size: number; gradPrefix?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id={`${gradPrefix}-0`} x1="7" x2="11" y1="15.5" y2="12">
          <stop stopColor="#08B962" />
          <stop offset="1" stopColor="#08B962" stopOpacity="0" />
        </linearGradient>
        <linearGradient gradientUnits="userSpaceOnUse" id={`${gradPrefix}-1`} x1="8" x2="11.5" y1="5.5" y2="11">
          <stop stopColor="#F94543" />
          <stop offset="1" stopColor="#F94543" stopOpacity="0" />
        </linearGradient>
        <linearGradient gradientUnits="userSpaceOnUse" id={`${gradPrefix}-2`} x1="3.5" x2="17.5" y1="13.5" y2="12">
          <stop stopColor="#FABC12" />
          <stop offset=".46" stopColor="#FABC12" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={GEMINI_PATH} fill="#3186FF" />
      <path d={GEMINI_PATH} fill={`url(#${gradPrefix}-0)`} />
      <path d={GEMINI_PATH} fill={`url(#${gradPrefix}-1)`} />
      <path d={GEMINI_PATH} fill={`url(#${gradPrefix}-2)`} />
    </svg>
  );
}

function ClaudeEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#D97757" className="shrink-0" aria-hidden>
      <path d={CLAUDE_PATH} fillRule="nonzero" />
    </svg>
  );
}

function CodexEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" className="shrink-0 text-foreground-icon-primary" aria-hidden>
      <path d={OPENAI_PATH} />
    </svg>
  );
}

function DeepSeekEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#4D6BFE" className="shrink-0" aria-hidden>
      <path d={DEEPSEEK_PATH} />
    </svg>
  );
}

function DoubaoEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      {DOUBAO_PATHS.map((path, i) => (
        <path key={i} d={path} fill={DOUBAO_FILLS[i]} />
      ))}
    </svg>
  );
}

function MinimaxEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id={MINIMAX_GRAD_ID} x1="0%" x2="100.182%" y1="50.057%" y2="50.057%">
          <stop offset="0%" stopColor="#E2167E" />
          <stop offset="100%" stopColor="#FE603C" />
        </linearGradient>
      </defs>
      <path d={MINIMAX_PATH} fill={`url(#${MINIMAX_GRAD_ID})`} fillRule="nonzero" />
    </svg>
  );
}

function YiEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" className="shrink-0 text-foreground-icon-primary" aria-hidden>
      <path d={YI_PATH} />
      <ellipse cx="20.146" cy="10.692" fill="#00FF25" rx="1.354" ry="1.379" />
    </svg>
  );
}

function BaichuanEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id={BAICHUAN_GRAD_ID} x1="17.764%" x2="100%" y1="8.678%" y2="91.322%">
          <stop offset="0%" stopColor="#FEC13E" />
          <stop offset="100%" stopColor="#FF6933" />
        </linearGradient>
      </defs>
      <path d={BAICHUAN_PATH} fill={`url(#${BAICHUAN_GRAD_ID})`} fillRule="nonzero" />
    </svg>
  );
}

function HunyuanEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      <circle cx="12" cy="12" fill="#0055E9" r="12" />
      {HUNYUAN_PATHS.map((path, i) => (
        <path key={i} d={path.d} fill={path.fill} />
      ))}
    </svg>
  );
}

function StepfunEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id={STEPFUN_GRAD_ID} x1="1.646" x2="18.342" y1="1.916" y2="22.091">
          <stop stopColor="#01A9FF" />
          <stop offset="1" stopColor="#0160FF" />
        </linearGradient>
      </defs>
      <path d={STEPFUN_PATH} fill={`url(#${STEPFUN_GRAD_ID})`} fillRule="evenodd" />
    </svg>
  );
}

function MistralEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      {MISTRAL_PATHS.map((path, i) => (
        <path key={i} d={path.d} fill={path.fill} />
      ))}
    </svg>
  );
}

function CohereEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      {COHERE_PATHS.map((path, i) => (
        <path key={i} d={path.d} fill={path.fill} clipRule="evenodd" fillRule="evenodd" />
      ))}
    </svg>
  );
}

function PerplexityEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#22B8CD" fillRule="nonzero" className="shrink-0" aria-hidden>
      <path d={PERPLEXITY_PATH} />
    </svg>
  );
}

function GrokEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" className="shrink-0 text-foreground-icon-primary" aria-hidden>
      {GROK_PATHS.map((p, i) => (<path key={i} d={p} />))}
    </svg>
  );
}

function KimiEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" className="shrink-0 text-foreground-icon-primary" aria-hidden>
      {KIMI_PATHS.map((p, i) => (<path key={i} d={p} />))}
    </svg>
  );
}

function PiEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" className="shrink-0 text-foreground-icon-primary" aria-hidden>
      {PI_PATHS.map((p, i) => (<path key={i} d={p} />))}
    </svg>
  );
}

function OmpEngineIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id="plugin-omp-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ec4899" />
          <stop offset=".5" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <path fill="url(#plugin-omp-grad)" d="M10 14h44v9H43v33h-9V23h-9v22h-9V23H10z" />
    </svg>
  );
}

function QoderEngineIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id="plugin-qoder-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset=".5" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="24" fill="url(#plugin-qoder-grad)" />
      <text x="32" y="40" fontSize="28" fontWeight="bold" fill="white" textAnchor="middle" fontFamily="sans-serif">Q</text>
    </svg>
  );
}

function OpenCodeEngineIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id="plugin-opencode-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10b981" />
          <stop offset=".5" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="48" height="48" rx="8" fill="url(#plugin-opencode-grad)" />
      <path d="M20 32l8-8m0 16l-8-8m16 0l8 8m0-16l-8 8" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function QwenEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id="qwen-icon-grad" x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor="#6336E7" stopOpacity=".84" />
          <stop offset="100%" stopColor="#6F69F7" stopOpacity=".84" />
        </linearGradient>
      </defs>
      <path
        d="M12.604 1.34c.393.69.784 1.382 1.174 2.075a.18.18 0 00.157.091h5.552c.174 0 .322.11.446.327l1.454 2.57c.19.337.24.478.024.837-.26.43-.513.864-.76 1.3l-.367.658c-.106.196-.223.28-.04.512l2.652 4.637c.172.301.111.494-.043.77-.437.785-.882 1.564-1.335 2.34-.159.272-.352.375-.68.37-.777-.016-1.552-.01-2.327.016a.099.099 0 00-.081.05 575.097 575.097 0 01-2.705 4.74c-.169.293-.38.363-.725.364-.997.003-2.002.004-3.017.002a.537.537 0 01-.465-.271l-1.335-2.323a.09.09 0 00-.083-.049H4.982c-.285.03-.553-.001-.805-.092l-1.603-2.77a.543.543 0 01-.002-.54l1.207-2.12a.198.198 0 000-.197 550.951 550.951 0 01-1.875-3.272l-.79-1.395c-.16-.31-.173-.496.095-.965.465-.813.927-1.625 1.387-2.436.132-.234.304-.334.584-.335a338.3 338.3 0 012.589-.001.124.124 0 00.107-.063l2.806-4.895a.488.488 0 01.422-.246c.524-.001 1.053 0 1.583-.006L11.704 1c.341-.003.724.032.9.34zm-3.432.403a.06.06 0 00-.052.03L6.254 6.788a.157.157 0 01-.135.078H3.253c-.056 0-.07.025-.041.074l5.81 10.156c.025.042.013.062-.034.063l-2.795.015a.218.218 0 00-.2.116l-1.32 2.31c-.044.078-.021.118.068.118l5.716.008c.046 0 .08.02.104.061l1.403 2.454c.046.081.092.082.139 0l5.006-8.76.783-1.382a.055.055 0 01.096 0l1.424 2.53a.122.122 0 00.107.062l2.763-.02a.04.04 0 00.035-.02.041.041 0 000-.04l-2.9-5.086a.108.108 0 010-.113l.293-.507 1.12-1.977c.024-.041.012-.062-.035-.062H9.2c-.059 0-.073-.026-.043-.077l1.434-2.505a.107.107 0 000-.114L9.225 1.774a.06.06 0 00-.053-.031zm6.29 8.02c.046 0 .058.02.034.06l-.832 1.465-2.613 4.585a.056.056 0 01-.05.029.058.058 0 01-.05-.029L8.498 9.841c-.02-.034-.01-.052.028-.054l.216-.012 6.722-.012z"
        fill="url(#qwen-icon-grad)"
        fillRule="nonzero"
      />
    </svg>
  );
}

function ChatGlmEngineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id="chatglm-icon-grad" x1="-18.756%" x2="70.894%" y1="49.371%" y2="90.944%">
          <stop offset="0%" stopColor="#504AF4" />
          <stop offset="100%" stopColor="#3485FF" />
        </linearGradient>
      </defs>
      <path
        d="M9.917 2c4.906 0 10.178 3.947 8.93 10.58-.014.07-.037.14-.057.21l-.003-.277c-.083-3-1.534-8.934-8.87-8.934-3.393 0-8.137 3.054-7.93 8.158-.04 4.778 3.555 8.4 7.95 8.332l.073-.001c1.2-.033 2.763-.429 3.1-1.657.063-.031.26.534.268.598.048.256.112.369.192.34.981-.348 2.286-1.222 1.952-2.38-.176-.61-1.775-.147-1.921-.347.418-.979 2.234-.926 3.153-.716.443.102.657.38 1.012.442.29.052.981-.2.96.242-1.5 3.042-4.893 5.41-8.808 5.41C3.654 22 0 16.574 0 11.737 0 5.947 4.959 2 9.917 2z"
        fill="url(#chatglm-icon-grad)"
        fillRule="evenodd"
      />
    </svg>
  );
}

/** Static brand marks rendered as <img> (aligned with host implementation) */
const RASTER_ICONS: Record<string, { src: string; alt: string }> = {
  claude: { src: claudeIcon, alt: "Claude" },
  chatglm: { src: chatglmIcon, alt: "GLM" },
  qwen: { src: qwenIcon, alt: "Qwen" },
  doubao: { src: doubaoIcon, alt: "Doubao" },
  minimax: { src: minimaxIcon, alt: "MiniMax" },
  yi: { src: yiIcon, alt: "Yi" },
  baichuan: { src: baichuanIcon, alt: "Baichuan" },
  hunyuan: { src: hunyuanIcon, alt: "Hunyuan" },
  stepfun: { src: stepfunIcon, alt: "StepFun" },
  gemini: { src: geminiIcon, alt: "Gemini" },
  mistral: { src: mistralIcon, alt: "Mistral" },
  cohere: { src: cohereIcon, alt: "Cohere" },
  perplexity: { src: perplexityIcon, alt: "Perplexity" },
  dsh: { src: deepseekIcon, alt: "DeepSeek Harness" },
  agy: { src: geminiIcon, alt: "Antigravity CLI" },
};

function FallbackEngineIcon({ size }: { size: number }) {
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
      className="shrink-0 text-foreground-icon-primary"
      aria-hidden
    >
      <path d="m4 17 6-6-6-6" />
      <path d="M12 19h8" />
    </svg>
  );
}

function resolveEngineIcon(norm: string, size: number) {
  // Check RASTER_ICONS first (brand icons loaded as <img>)
  if (norm.includes("claude")) {
    const raster = RASTER_ICONS.claude;
    return <img src={raster.src} alt={raster.alt} width={size} height={size} className="shrink-0" />;
  }
  if (norm.includes("glm") || norm.includes("chatglm")) {
    const raster = RASTER_ICONS.chatglm;
    return <img src={raster.src} alt={raster.alt} width={size} height={size} className="shrink-0" />;
  }
  if (norm.includes("qwen")) {
    const raster = RASTER_ICONS.qwen;
    return <img src={raster.src} alt={raster.alt} width={size} height={size} className="shrink-0" />;
  }
  if (norm.includes("doubao") || norm.includes("volc")) {
    const raster = RASTER_ICONS.doubao;
    return <img src={raster.src} alt={raster.alt} width={size} height={size} className="shrink-0" />;
  }
  if (norm.includes("minimax") || norm.includes("abab")) {
    const raster = RASTER_ICONS.minimax;
    return <img src={raster.src} alt={raster.alt} width={size} height={size} className="shrink-0" />;
  }
  if (norm.includes("yi")) {
    const raster = RASTER_ICONS.yi;
    return <img src={raster.src} alt={raster.alt} width={size} height={size} className="shrink-0" />;
  }
  if (norm.includes("baichuan")) {
    const raster = RASTER_ICONS.baichuan;
    return <img src={raster.src} alt={raster.alt} width={size} height={size} className="shrink-0" />;
  }
  if (norm.includes("hunyuan")) {
    const raster = RASTER_ICONS.hunyuan;
    return <img src={raster.src} alt={raster.alt} width={size} height={size} className="shrink-0" />;
  }
  if (norm.includes("step") || norm.includes("stepfun")) {
    const raster = RASTER_ICONS.stepfun;
    return <img src={raster.src} alt={raster.alt} width={size} height={size} className="shrink-0" />;
  }
  if (norm.includes("gemini")) {
    const raster = RASTER_ICONS.gemini;
    return <img src={raster.src} alt={raster.alt} width={size} height={size} className="shrink-0" />;
  }
  if (norm.includes("mistral") || norm.includes("mixtral") || norm.includes("codestral")) {
    const raster = RASTER_ICONS.mistral;
    return <img src={raster.src} alt={raster.alt} width={size} height={size} className="shrink-0" />;
  }
  if (norm.includes("cohere") || norm.includes("command-r")) {
    const raster = RASTER_ICONS.cohere;
    return <img src={raster.src} alt={raster.alt} width={size} height={size} className="shrink-0" />;
  }
  if (norm.includes("perplexity") || norm.includes("sonar")) {
    const raster = RASTER_ICONS.perplexity;
    return <img src={raster.src} alt={raster.alt} width={size} height={size} className="shrink-0" />;
  }
  if (norm.includes("dsh") || norm.includes("deepseek")) {
    const raster = RASTER_ICONS.dsh;
    return <img src={raster.src} alt={raster.alt} width={size} height={size} className="shrink-0" />;
  }
  if (norm.includes("agy") || norm.includes("antigravity")) {
    const raster = RASTER_ICONS.agy;
    return <img src={raster.src} alt={raster.alt} width={size} height={size} className="shrink-0" />;
  }

  // Inline SVG for OMP, Qoder, OpenCode, and monochrome icons
  if (norm.includes("codex") || norm.includes("gpt") || norm.includes("openai")) return <CodexEngineIcon size={size} />;
  if (norm.includes("grok")) return <GrokEngineIcon size={size} />;
  if (norm.includes("kimi")) return <KimiEngineIcon size={size} />;
  if (norm.includes("pi")) return <PiEngineIcon size={size} />;
  if (norm.includes("omp")) return <OmpEngineIcon size={size} />;
  if (norm.includes("qoder-cn")) return <QoderEngineIcon size={size} />;
  if (norm.includes("qoder")) return <QoderEngineIcon size={size} />;
  if (norm.includes("opencode")) return <OpenCodeEngineIcon size={size} />;

  return <FallbackEngineIcon size={size} />;
}

/** 对应项目内 EngineIcon 原生精确 SVG */
export function ProjectEngineIcon({ engine, size = 18 }: { engine: string; size?: number }) {
  return resolveEngineIcon(engine.toLowerCase(), size);
}
