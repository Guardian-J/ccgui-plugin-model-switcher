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
      const id = trimmed.slice(0, -1).trim();
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
