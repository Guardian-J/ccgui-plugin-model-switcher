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

export function parsePiFamilyProviders(text: string, format: string): Record<string, {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  api?: string;
  models: Array<{ id: string; name?: string }>;
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
            const models = Array.isArray((raw as any).models)
              ? (raw as any).models.map((m: any) => typeof m === "string" ? { id: m } : { id: m.id, name: m.name })
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
  const providers: Record<string, any> = {};
  const lines = text.split(/\r?\n/);
  let inProviders = false;
  let curProvider: any = null;
  let curModel: any = null;
  let inModels = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = line.search(/\S/);

    if (indent === 0) {
      inProviders = trimmed.startsWith("providers:");
      curProvider = null;
      continue;
    }
    if (!inProviders) continue;

    if (indent >= 2 && indent <= 4 && trimmed.endsWith(":") && !trimmed.startsWith("-") && !trimmed.startsWith("models:")) {
      const id = trimmed.slice(0, -1).trim().replace(/^['"]|['"]$/g, "");
      curProvider = { id, name: id, baseUrl: "", apiKey: "", models: [] };
      providers[id] = curProvider;
      inModels = false;
      curModel = null;
      continue;
    }

    if (!curProvider) continue;

    if (trimmed.startsWith("models:")) {
      inModels = true;
      continue;
    }

    if (!inModels) {
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
      if (trimmed.startsWith("-")) {
        curModel = {};
        curProvider.models.push(curModel);
        const rest = trimmed.slice(1).trim();
        const kv = rest.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
        if (kv) {
          curModel[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, "");
        }
      } else if (curModel) {
        const kv = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
        if (kv) {
          curModel[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, "");
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

  const keyIndent = providersIndent + 2;
  let startLine = -1;
  for (let i = providersIndex + 1; i < lines.length; i++) {
    const indent = lines[i].search(/\S/);
    if (indent < 0 || lines[i].trim().startsWith("#")) continue;
    if (indent <= providersIndent) break;
    if (indent === keyIndent && yamlProviderKey(lines[i]) === id) {
      startLine = i;
      break;
    }
  }
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

function renderYamlProviderLines(id: string, patch: PiFamilyProviderPatch): string[] {
  const lines = [
    `  ${id}:`,
    `    name: ${JSON.stringify(patch.name)}`,
    `    baseUrl: ${JSON.stringify(patch.baseUrl)}`,
    `    api: ${patch.api}`,
    `    apiKey: ${JSON.stringify(patch.apiKey)}`,
  ];
  const model = patch.model?.trim();
  if (model) {
    lines.push("    models:", `      - id: ${JSON.stringify(model)}`);
  } else {
    lines.push("    models: []");
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
    if (lines.length === 0 || !lines.some((l) => /^providers\s*:/.test(l.trim()))) {
      lines = ["providers:"];
    }
    const range = findYamlProviderLineRange(lines, id);
    const newBlockLines = renderYamlProviderLines(id, nextPatch);

    if (!range || range.startLine < 0) {
      const pIdx = range?.providersIndex ?? lines.findIndex((l) => /^providers\s*:/.test(l.trim()));
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
  const models = Array.isArray(prev.models) ? [...prev.models] : [];
  const model = nextPatch.model?.trim();
  if (model && !models.some((item) => item && typeof item === "object" && (item as { id?: string }).id === model)) {
    models.unshift({ id: model });
  }
  providers[id] = {
    ...prev,
    name: nextPatch.name,
    baseUrl: nextPatch.baseUrl,
    api: nextPatch.api,
    apiKey: nextPatch.apiKey,
    models,
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
    return lines.join(nl) + (lines.length > 0 ? nl : "");
  }
  try {
    const obj = JSON.parse(stripJsoncComments(text)) as { providers?: Record<string, unknown> };
    if (obj.providers && typeof obj.providers === "object") {
      delete obj.providers[id];
    }
    return `${JSON.stringify(obj, null, 2)}\n`;
  } catch {
    return text;
  }
}
