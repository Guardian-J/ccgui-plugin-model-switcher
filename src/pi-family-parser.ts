import { DEFAULT_PI_FAMILY_API, isPiFamilyApiProtocol, type PiFamilyApiProtocol } from "./types";

function stripJsoncComments(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && input[i + 1] === "/") {
      while (i < input.length && input[i] !== "\n") i++;
      if (i < input.length) out += input[i];
      continue;
    }
    if (ch === "/" && input[i + 1] === "*") {
      i += 2;
      while (i < input.length - 1 && !(input[i] === "*" && input[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

export interface PiFamilyModelItem {
  id: string;
  name?: string;
  [key: string]: unknown;
}
export function parseStructuredValue(val: unknown): unknown {
  if (val && typeof val === "object") return val;
  if (typeof val !== "string") return val;
  let cur = val.trim();
  for (let i = 0; i < 15; i++) {
    if ((cur.startsWith('"') && cur.endsWith('"')) || (cur.startsWith("'") && cur.endsWith("'"))) {
      try {
        const parsed = JSON.parse(cur);
        if (typeof parsed === "string") {
          cur = parsed.trim();
          continue;
        }
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      } catch {
        cur = cur.slice(1, -1).trim();
        continue;
      }
    }
    if ((cur.startsWith("{") && cur.endsWith("}")) || (cur.startsWith("[") && cur.endsWith("]"))) {
      try {
        const parsed = JSON.parse(cur);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
        if (typeof parsed === "string") {
          cur = parsed.trim();
          continue;
        }
      } catch {
        try {
          const unescaped = cur.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
          const parsed = JSON.parse(unescaped);
          if (parsed && typeof parsed === "object") {
            return parsed;
          }
        } catch {
          break;
        }
      }
    }
    if (cur.includes('\\"')) {
      try {
        const unescaped = cur.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        const parsed = JSON.parse(unescaped);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      } catch {}
    }
    break;
  }
  return cur;
}

export function normalizeThinking(val: unknown): Record<string, unknown> {
  const structured = parseStructuredValue(val);
  if (structured && typeof structured === "object" && !Array.isArray(structured)) {
    const obj = structured as Record<string, unknown>;
    const mode = typeof obj.mode === "string" ? obj.mode : "anthropic-adaptive";
    const defaultLevel = typeof obj.defaultLevel === "string" ? obj.defaultLevel : "max";
    const efforts = Array.isArray(obj.efforts) && obj.efforts.length > 0
      ? obj.efforts
      : ["low", "medium", "high", "xhigh", "max"];
    return { ...obj, mode, defaultLevel, efforts };
  }
  return {
    mode: "anthropic-adaptive",
    defaultLevel: "max",
    efforts: ["low", "medium", "high", "xhigh", "max"],
  };
}


export function parsePiFamilyProviders(text: string, format: string): Record<string, {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  api?: string;
  models: Array<PiFamilyModelItem>;
}> {
  if (!text || !text.trim()) return {};
  if (format === "json" || text.trim().startsWith("{")) {
    const stripped = stripJsoncComments(text);
    try {
      const obj = JSON.parse(stripped);
      const res: Record<string, any> = {};
      const providersMap = obj && typeof obj.providers === "object" ? obj.providers : obj;
      if (providersMap && typeof providersMap === "object") {
        for (const [id, raw] of Object.entries(providersMap)) {
          if (raw && typeof raw === "object") {
            const models: PiFamilyModelItem[] = Array.isArray((raw as Record<string, unknown>).models)
              ? ((raw as Record<string, unknown>).models as unknown[]).map((m: unknown) => {
                  if (typeof m === "string") return { id: m };
                  if (m && typeof m === "object") {
                    const mObj = { ...(m as Record<string, unknown>) };
                    if ("thinking" in mObj && mObj.thinking !== undefined) {
                      mObj.thinking = normalizeThinking(mObj.thinking);
                    }
                    return { ...mObj, id: String(mObj.id || "") };
                  }
                  return { id: "" };
                }).filter((m: PiFamilyModelItem) => !!m.id)
              : [];
            res[id] = {
              id,
              name: (raw as any).name || id,
              baseUrl: (raw as any).baseUrl || "",
              apiKey: (raw as any).apiKey || "",
              api: (raw as any).api,
              models,
            };
          }
        }
      }
      return res;
    } catch {
      return {};
    }
  }

  // YAML parser
  const providers: Record<string, {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    api?: string;
    models: Array<PiFamilyModelItem>;
  }> = {};
  const lines = text.split(/\r?\n/);
  let inProviders = false;
  let providerIndent = -1;
  let curProvider: {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    api?: string;
    models: Array<PiFamilyModelItem>;
  } | null = null;
  let curProviderFieldIndent = -1;
  let curModel: PiFamilyModelItem | null = null;
  let curModelProp: string | null = null;
  let curModelPropIndent = 0;
  let inModels = false;

  const parseModelValue = (k: string, raw: string): unknown => {
    if (k === "thinking") return normalizeThinking(raw);
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (/^\d+$/.test(raw)) return Number(raw);
    if (raw.startsWith("{") || raw.startsWith("[")) return parseStructuredValue(raw);
    return raw.replace(/^['"]|['"]$/g, "");
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = line.search(/\S/);

    if (indent === 0) {
      inProviders = trimmed.startsWith("providers:");
      providerIndent = -1;
      curProvider = null;
      curProviderFieldIndent = -1;
      inModels = false;
      curModel = null;
      curModelProp = null;
      continue;
    }
    if (!inProviders) continue;

    if (providerIndent < 0) providerIndent = indent;

    // 供应商 key 以 YAML 映射键为准（id）。`name: value` 同行赋值不能当成新 key；
    // 仅认与首个供应商同缩进的键，避免把 provider 内的 `headers:` 等子块误判为新供应商。
    if (indent === providerIndent && trimmed.endsWith(":") && !trimmed.startsWith("-") && !trimmed.startsWith("models:")) {
      const id = yamlProviderKey(line);
      if (!id) continue;
      curProvider = { id, name: id, baseUrl: "", apiKey: "", models: [] };
      curProviderFieldIndent = -1;
      providers[id] = curProvider;
      inModels = false;
      curModel = null;
      curModelProp = null;
      continue;
    }

    if (!curProvider) continue;
    if (curProviderFieldIndent < 0) curProviderFieldIndent = indent;

    if (indent === curProviderFieldIndent && trimmed.startsWith("models:")) {
      inModels = true;
      curModel = null;
      curModelProp = null;
      continue;
    }

    if (inModels && indent <= curProviderFieldIndent) {
      inModels = false;
      curModel = null;
      curModelProp = null;
    }

    if (!inModels) {
      if (indent !== curProviderFieldIndent) continue;
      const kv = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (kv) {
        const k = kv[1];
        const v = kv[2].trim().replace(/^['"]|['"]$/g, "");
        if (k === "name") curProvider.name = v || curProvider.id;
        else if (k === "baseUrl") curProvider.baseUrl = v;
        else if (k === "apiKey") curProvider.apiKey = v;
        else if (k === "api") curProvider.api = v;
      }
    } else {
      if (curModelProp && indent > curModelPropIndent && curModel) {
        // 多行属性解析（例如 thinking: 下的 mode: anthropic-adaptive 或 - low）
        const propKv = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
        if (propKv) {
          const pk = propKv[1];
          const pval = propKv[2].trim().replace(/^['"]|['"]$/g, "");
          const propVal = curModel[curModelProp];
          if (propVal && typeof propVal === "object" && !Array.isArray(propVal)) {
            (propVal as Record<string, unknown>)[pk] = pval;
          }
        } else if (trimmed.startsWith("-")) {
          const itemVal = trimmed.slice(1).trim().replace(/^['"]|['"]$/g, "");
          const propVal = curModel[curModelProp];
          if (Array.isArray(propVal)) {
            propVal.push(itemVal);
          }
        }
        continue;
      }
      curModelProp = null;

      if (trimmed.startsWith("-")) {
        curModel = { id: "" };
        curProvider.models.push(curModel);
        const rest = trimmed.slice(1).trim();
        const kv = rest.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
        if (kv) {
          const k = kv[1];
          const raw = kv[2].trim();
          if (k === "thinking" && !raw) {
            curModel.thinking = {};
            curModelProp = "thinking";
            curModelPropIndent = indent;
          } else {
            curModel[k] = parseModelValue(k, raw);
          }
        }
      } else if (curModel) {
        const kv = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
        if (kv) {
          const k = kv[1];
          const raw = kv[2].trim();
          if (k === "thinking" && !raw) {
            curModel.thinking = {};
            curModelProp = "thinking";
            curModelPropIndent = indent;
          } else {
            curModel[k] = parseModelValue(k, raw);
          }
        }
      }
    }
  }

  return providers;
}

export interface PiFamilyProviderPatch {
  name: string;
  baseUrl: string;
  apiKey: string;
  api: PiFamilyApiProtocol;
  model?: string;
  models?: Array<PiFamilyModelItem | string>;
}

function mergePiFamilyModels(
  existing: Array<PiFamilyModelItem>,
  patch: PiFamilyProviderPatch,
): Array<PiFamilyModelItem> {
  const existingMap = new Map<string, PiFamilyModelItem>();
  for (const m of existing) {
    if (m && m.id) {
      existingMap.set(m.id.trim(), m);
    }
  }

  const result: Array<PiFamilyModelItem> = [];
  const seen = new Set<string>();

  const add = (item?: PiFamilyModelItem | string) => {
    if (!item) return;
    const id = typeof item === "string" ? item.trim() : item.id?.trim();
    if (!id || seen.has(id)) return;
    seen.add(id);

    const prev = existingMap.get(id);
    let merged: PiFamilyModelItem;
    if (typeof item === "string") {
      merged = prev ? { ...prev, id } : { id };
    } else {
      merged = prev ? { ...prev, ...item, id } : { ...item, id };
    }
    if ("thinking" in merged && merged.thinking !== undefined) {
      merged.thinking = normalizeThinking(merged.thinking);
    }
    result.push(merged);
  };

  if (patch.model?.trim()) {
    add(patch.model.trim());
  }
  if (Array.isArray(patch.models)) {
    for (const m of patch.models) add(m);
  }
  for (const m of existing) {
    add(m);
  }
  return result;
}

function yamlProviderKey(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) return null;
  const match = trimmed.match(/^("[^"]+"|'[^']+'|[A-Za-z0-9_.-]+)\s*:/);
  if (!match) return null;
  return match[1].replace(/^['"]|['"]$/g, "");
}

interface YamlProviderLineRange {
  providersIndex: number;
  keyIndent: number;
  startLine: number;
  endLine: number;
}

function findYamlProviderLineRange(lines: string[], id: string): YamlProviderLineRange | null {
  let providersIndex = -1;
  let providersIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const indent = lines[i].search(/\S/);
    if (indent < 0 || lines[i].trim().startsWith("#")) continue;
    if (indent === 0 && /^providers\s*:/.test(lines[i].trim())) {
      providersIndex = i;
      providersIndent = indent;
      break;
    }
  }
  if (providersIndex < 0) return null;

  let keyIndent = -1;
  let startLine = -1;
  for (let i = providersIndex + 1; i < lines.length; i++) {
    const indent = lines[i].search(/\S/);
    if (indent < 0 || lines[i].trim().startsWith("#")) continue;
    if (indent <= providersIndent) break;
    if (keyIndent < 0) keyIndent = indent;
    if (indent === keyIndent && yamlProviderKey(lines[i]) === id) {
      startLine = i;
      break;
    }
  }
  if (keyIndent < 0) keyIndent = providersIndent + 2;
  if (startLine < 0) {
    return { providersIndex, keyIndent, startLine: -1, endLine: -1 };
  }

  let endLine = lines.length;
  for (let i = startLine + 1; i < lines.length; i++) {
    const indent = lines[i].search(/\S/);
    if (indent < 0) continue;
    if (indent <= keyIndent) {
      endLine = i;
      break;
    }
  }
  return { providersIndex, keyIndent, startLine, endLine };
}

/**
 * 从现有 provider 块中提取插件不管理的额外字段行，避免改写时静默丢弃用户自定义配置。
 */
function extractExtraYamlLines(
  lines: string[],
  startLine: number,
  endLine: number,
  targetFieldIndent: number,
): string[] {
  const MANAGED_KEYS: Record<string, true> = {
    name: true,
    baseUrl: true,
    api: true,
    auth: true,
    apiKey: true,
    models: true,
  };
  let fieldIndent = -1;
  for (let i = startLine + 1; i < endLine; i++) {
    const line = lines[i];
    const indent = line.search(/\S/);
    if (indent < 0 || line.trim().startsWith("#")) continue;
    fieldIndent = indent;
    break;
  }
  if (fieldIndent < 0) return [];

  const extra: string[] = [];
  let capturing = false;
  const shift = targetFieldIndent - fieldIndent;
  for (let i = startLine + 1; i < endLine; i++) {
    const line = lines[i];
    const indent = line.search(/\S/);
    if (indent < 0) continue;
    if (indent === fieldIndent) {
      const kv = line.trim().match(/^([a-zA-Z0-9_-]+)\s*:/);
      const key = kv ? kv[1] : null;
      capturing = key !== null && !MANAGED_KEYS[key];
    }
    if (capturing) {
      if (shift === 0) {
        extra.push(line);
      } else {
        const nextIndent = Math.max(targetFieldIndent, indent + shift);
        extra.push(`${" ".repeat(nextIndent)}${line.trimStart()}`);
      }
    }
  }
  return extra;
}

function renderYamlProviderLines(
  id: string,
  patch: PiFamilyProviderPatch,
  models: Array<PiFamilyModelItem>,
  extraLines: string[] = [],
  keyIndent = 2,
): string[] {
  const kPad = " ".repeat(keyIndent);
  const fPad = " ".repeat(keyIndent + 2);
  const mPad = " ".repeat(keyIndent + 4);
  const pPad = " ".repeat(keyIndent + 6);
  // omp: anthropic-messages 且未写 auth 时会强制 isOAuth，请求被塑成 Claude Code
  // OAuth（Accept: json、?beta=true），中转站按 SSE/API Key 走就会卡 1–2 分钟。
  // 独立渠道一律走 baseUrl + apiKey，显式关掉 OAuth。
  const lines = [
    `${kPad}${id}:`,
    `${fPad}name: ${JSON.stringify(patch.name)}`,
    `${fPad}baseUrl: ${JSON.stringify(patch.baseUrl)}`,
    `${fPad}api: ${patch.api}`,
    `${fPad}auth: apiKey`,
    `${fPad}apiKey: ${JSON.stringify(patch.apiKey)}`,
    ...extraLines,
  ];
  if (models.length > 0) {
    lines.push(`${fPad}models:`);
    for (const m of models) {
      lines.push(`${mPad}- id: ${JSON.stringify(m.id)}`);
      for (const [key, val] of Object.entries(m)) {
        if (key === "id") continue;
        if (key === "thinking") {
          const thinkingObj = normalizeThinking(val);
          lines.push(`${pPad}thinking: ${JSON.stringify(thinkingObj)}`);
        } else if (typeof val === "boolean" || typeof val === "number") {
          lines.push(`${pPad}${key}: ${val}`);
        } else if (typeof val === "string") {
          lines.push(`${pPad}${key}: ${JSON.stringify(val)}`);
        } else if (Array.isArray(val) || (val && typeof val === "object")) {
          lines.push(`${pPad}${key}: ${JSON.stringify(val)}`);
        }
      }
    }
  } else {
    lines.push(`${fPad}models: []`);
  }
  return lines;
}


/**
 * 仅改写指定 provider，保留 models.yml 中其他供应商原文与行内注释。
 */
export function upsertPiFamilyProviderText(
  text: string,
  format: string,
  id: string,
  patch: PiFamilyProviderPatch,
): string {
  const api = isPiFamilyApiProtocol(patch.api) ? patch.api : DEFAULT_PI_FAMILY_API;
  const nextPatch = { ...patch, api };

  if (format === "yaml") {
    const nl = text.includes("\r\n") ? "\r\n" : "\n";
    let lines = text.trim() ? text.split(/\r?\n/) : [];
    if (lines.length === 0) {
      lines = ["providers:"];
    } else if (!lines.some((l) => /^providers\s*:/.test(l.trim()))) {
      // 保留其他顶层 YAML 配置，仅在文件末尾追加 providers。
      lines.push("providers:");
    }
    const existingProviders = parsePiFamilyProviders(text, "yaml");
    const existingModels = existingProviders[id]?.models || [];
    const mergedModels = mergePiFamilyModels(existingModels, nextPatch);

    const range = findYamlProviderLineRange(lines, id);
    const keyIndent = range?.keyIndent ?? 2;
    // 保留现有 provider 中插件不管理的额外字段，避免每次 upsert 时静默丢弃用户自定义配置
    const extraLines = range && range.startLine >= 0
      ? extractExtraYamlLines(lines, range.startLine, range.endLine, keyIndent + 2)
      : [];
    const newBlockLines = renderYamlProviderLines(id, nextPatch, mergedModels, extraLines, keyIndent);
    if (!range || range.startLine < 0) {
      const pIdx = range?.providersIndex ?? lines.findIndex((l) => /^providers\s*:/.test(l.trim()));
      // Expand an empty mapping before inserting the first provider again.
      if (pIdx >= 0) lines[pIdx] = lines[pIdx].replace(/^(providers\s*:)\s*\{\s*\}/, "$1");
      lines.splice(pIdx >= 0 ? pIdx + 1 : lines.length, 0, ...newBlockLines);
    } else {
      lines.splice(range.startLine, range.endLine - range.startLine, ...newBlockLines);
    }
    return lines.join(nl) + nl;
  }

  const stripped = stripJsoncComments(text.trim() || '{"providers":{}}');
  const obj = JSON.parse(stripped) as { providers?: Record<string, Record<string, unknown>> };
  const providers = obj.providers && typeof obj.providers === "object" ? obj.providers : {};
  const prev = providers[id] && typeof providers[id] === "object" ? providers[id] : {};
  const existingModels = Array.isArray(prev.models)
    ? prev.models.map((m: any) => typeof m === "string" ? { id: m } : { ...m, id: m.id })
    : [];
  const mergedModels = mergePiFamilyModels(existingModels, nextPatch);

  providers[id] = {
    ...prev,
    name: nextPatch.name,
    baseUrl: nextPatch.baseUrl,
    api: nextPatch.api,
    auth: "apiKey",
    apiKey: nextPatch.apiKey,
    models: mergedModels,
  };
  return `${JSON.stringify({ ...obj, providers }, null, 2)}\n`;
}

/** 从 models.yml / models.json 删除指定供应商，其余内容尽量保留。 */
export function removePiFamilyProviderText(text: string, format: string, id: string): string {
  if (!text.trim()) return text;
  if (format === "yaml") {
    const nl = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    const range = findYamlProviderLineRange(lines, id);
    if (!range || range.startLine < 0) return text;
    lines.splice(range.startLine, range.endLine - range.startLine);
    const nextContent = lines.slice(range.providersIndex + 1).find(line => line.trim() && !line.trim().startsWith("#"));
    if (!nextContent || nextContent.search(/\S/) === 0) {
      // Bare `providers:` is YAML null, which the host rejects; zero providers is valid.
      lines[range.providersIndex] = lines[range.providersIndex].replace(/^(providers\s*:)/, "$1 {}");
    }
    return lines.join(nl) + (lines.length > 0 ? nl : "");
  }
  try {
    const obj = JSON.parse(stripJsoncComments(text)) as Record<string, unknown>;
    if (obj.providers && typeof obj.providers === "object") {
      const providers = obj.providers as Record<string, unknown>;
      if (!(id in providers)) return text;
      delete providers[id];
      return `${JSON.stringify(obj, null, 2)}\n`;
    }
    if (!(id in obj)) return text;
    delete obj[id];
    return `${JSON.stringify(obj, null, 2)}\n`;
  } catch {
    return text;
  }
}

function rewritePiFamilyProviderModels(
  text: string,
  format: string,
  providerId: string,
  transform: (models: Array<PiFamilyModelItem>) => { changed: boolean; models: Array<PiFamilyModelItem> },
): string {
  if (!text.trim() || !providerId) return text;
  if (format === "yaml") {
    const nl = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    const range = findYamlProviderLineRange(lines, providerId);
    if (!range || range.startLine < 0) return text;
    const existing = parsePiFamilyProviders(text, "yaml")[providerId];
    if (!existing) return text;
    const { changed, models } = transform(existing.models);
    if (!changed) return text;
    const patch: PiFamilyProviderPatch = {
      name: existing.name || providerId,
      baseUrl: existing.baseUrl || "",
      apiKey: existing.apiKey || "",
      api: isPiFamilyApiProtocol(existing.api || "") ? (existing.api as PiFamilyApiProtocol) : DEFAULT_PI_FAMILY_API,
    };
    const extraLines = extractExtraYamlLines(lines, range.startLine, range.endLine, range.keyIndent + 2);
    const newBlockLines = renderYamlProviderLines(providerId, patch, models, extraLines, range.keyIndent);
    lines.splice(range.startLine, range.endLine - range.startLine, ...newBlockLines);
    return lines.join(nl) + nl;
  }
  try {
    const obj = JSON.parse(stripJsoncComments(text)) as Record<string, unknown>;
    const container = obj.providers && typeof obj.providers === "object"
      ? (obj.providers as Record<string, unknown>)
      : obj;
    const rawProvider = container[providerId];
    if (!rawProvider || typeof rawProvider !== "object" || Array.isArray(rawProvider)) return text;
    const providerObj = rawProvider as Record<string, unknown>;
    if (!Array.isArray(providerObj.models)) return text;
    const parsedModels: PiFamilyModelItem[] = providerObj.models
      .map((m: unknown) => (typeof m === "string" ? { id: m } : (m && typeof m === "object" ? { ...(m as Record<string, unknown>), id: String((m as Record<string, unknown>).id || "") } : { id: "" })))
      .filter((m) => !!m.id);
    const { changed, models } = transform(parsedModels);
    if (!changed) return text;
    providerObj.models = models;
    return `${JSON.stringify(obj, null, 2)}\n`;
  } catch {
    return text;
  }
}

/** 从 models.yml / models.json 中指定供应商的 models 列表删除单个模型。 */
export function removePiFamilyModelText(
  text: string,
  format: string,
  providerId: string,
  modelId: string,
): string {
  const target = modelId.trim();
  if (!target) return text;
  return rewritePiFamilyProviderModels(text, format, providerId, (models) => {
    const next = models.filter((m) => m.id.trim() !== target);
    return { changed: next.length !== models.length, models: next };
  });
}

/** 从 models.yml / models.json 中清除指定模型的 contextWindow / maxTokens，保留模型本身及其他字段。 */
export function clearPiFamilyModelMetadataText(
  text: string,
  format: string,
  providerId: string,
  modelId: string,
): string {
  const target = modelId.trim();
  if (!target) return text;
  return rewritePiFamilyProviderModels(text, format, providerId, (models) => {
    let changed = false;
    const next = models.map((m) => {
      if (m.id.trim() !== target) return m;
      if (!("contextWindow" in m) && !("maxTokens" in m)) return m;
      changed = true;
      const { contextWindow: _cw, maxTokens: _mt, ...rest } = m;
      return rest;
    });
    return { changed, models: next };
  });
}
