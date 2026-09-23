import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { build } from "vite";
import { runInNewContext } from "node:vm";

async function loadModule(path) {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      target: "es2022",
      lib: { entry: fileURLToPath(new URL(path, import.meta.url)), formats: ["es"] },
    },
  });
  const { code } = result[0].output[0];
  return import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
}

const bridge = await loadModule("../src/system-bridge.ts");
const modelDisplay = await loadModule("../src/model-display.ts");
assert.equal(modelDisplay.compactPluginModelLabel('模型 plugin_model-switcher_custom_1789434719040/deepseek-v4-flash · high'), '模型 deepseek-v4-flash · high');
assert.equal(modelDisplay.compactPluginModelLabel('plugin_model-switcher_custom_1/org/model'), 'org/model');
assert.equal(modelDisplay.compactPluginModelLabel('openrouter/org/model'), 'openrouter/org/model');
// The delete button receives the displayed ID, while older entries retain suffixes/prefixes.
for (const engine of ['omp', 'pi']) {
  const channel = { id: 'custom_test', isPlugin: true };
  const entries = ['grok-4.6[1m]', 'plugin_model-switcher_custom_test/grok-4.6',
    'custom_test/grok-4.6[1M]', 'grok-4.5', 'other-provider/grok-4.6'];
  const remaining = bridge.withoutCustomModel(engine, channel, entries, 'grok-4.6');
  assert.deepEqual(remaining, ['grok-4.5', 'other-provider/grok-4.6'], 'Delete all aliases of the displayed model, preserving other IDs');
  assert.equal(entries.length, 5, 'Do not mutate persisted state before saving');
  assert.deepEqual(bridge.withoutCustomModel(engine, channel, remaining, 'grok-4.6'), remaining);
}
assert.deepEqual(bridge.withoutCustomModel('omp', { id: 'relay' }, ['relay/model[1m]', 'keep'], 'model'), ['keep']);
assert.deepEqual(bridge.withoutCustomModel('claude', null, ['sonnet[1m]', 'opus'], 'sonnet'), ['opus']);
const scrub = await loadModule("../src/prompt-scrubber.ts");
const policy = await loadModule("../src/selection-policy.ts");
const calls = [];
let current = null;
const piFamilyModels = {
  omp: 'providers:\n  custom-omp:\n    baseUrl: "https://omp-relay.example.com"\n    apiKey: "sk-omp"\n    models:\n      - id: "omp-model-1"\n        name: "OMP Model 1"\n',
  pi: '{\n  "providers": {\n    "custom-pi": {\n      "baseUrl": "https://pi-relay.example.com",\n      "apiKey": "sk-pi",\n      "models": [{ "id": "pi-model-1", "name": "PI Model 1" }]\n    }\n  }\n}',
};
globalThis.window = {
  dispatchEvent() {},
  __TAURI_INTERNALS__: {
    async invoke(command, args) {
      calls.push({ command, args });
      if (command === "get_app_settings") return {};
      if (command === "get_cli_config")
        return {
          claude: {
            current,
            providers: {
              relay: {
                name: "Relay",
                baseUrl: "https://example.com",
                model: "relay-model",
              },
            },
          },
        };
      if (command === "provider_file_paths")
        return ["C:/preview/.claude/settings.json"];
      if (["set_current_provider", "upsert_provider", "delete_provider"].includes(command))
        return {};
      if (command === "list_engine_models")
        return {
          models: [{ id: `${args.engine}-model` }],
          authoritative: true,
        };
      if (command === "fetch_provider_models")
        return {
          models: [`api:${args.baseUrl}`],
          data: [],
        };
      if (command === "list_engines")
        return [
          { id: "claude", available: true, enabled: true },
          { id: "codex", available: false, enabled: true },
          { id: "kimi", available: true, enabled: false },
          { id: "grok", available: true, enabled: true },
        ];
      if (command === "official_config_read") {
        if (args.engine === "claude")
          return [{
            path: "C:/preview/.claude/settings.json",
            format: "json",
            exists: true,
            content: JSON.stringify({
              env: {
                ANTHROPIC_BASE_URL: "https://api.anthropic.com",
                ANTHROPIC_AUTH_TOKEN: "sk-native",
                ANTHROPIC_MODEL: "claude-sonnet",
              },
            }),
          }];
        if (args.engine === "codex")
          return [
            {
              path: "C:/preview/.codex/config.toml",
              format: "toml",
              exists: true,
              content: 'model = "gpt-5"\n[model_providers.ccgui]\nbase_url = "https://api.openai.com/v1"\n',
            },
            {
              path: "C:/preview/.codex/auth.json",
              format: "json",
              exists: true,
              content: JSON.stringify({ OPENAI_API_KEY: "sk-codex" }),
            },
          ];
        if (args.engine === "kimi")
          return [{
            path: "C:/preview/.kimi-code/config.toml",
            format: "toml",
            exists: true,
            content: 'default_model = "kimi-k2"\n[providers.ccgui]\nbase_url = "https://api.moonshot.cn/v1"\napi_key = "sk-kimi"\n',
          }];
        if (args.engine === "grok")
          return [{
            path: "C:/preview/.grok/config.toml",
            format: "toml",
            exists: true,
            content: '[endpoints]\nmodels_base_url = "https://api.x.ai"\n[model.grok-4]\napi_key = "sk-grok"\n[models]\ndefault = "grok-4"\n',
          }];
        return [];
      }
      if (command === "pi_family_models_config_write") {
        if (args.engine === "omp" || args.engine === "pi") piFamilyModels[args.engine] = args.text;
        return {};
      }
      if (command === "pi_family_models_config_read") {
        if (args.engine === "omp") {
          return {
            file: { format: "yaml", path: "C:/preview/.omp/agent/models.yml", exists: true },
            text: piFamilyModels.omp,
          };
        }
        if (args.engine === "pi") {
          return {
            file: { format: "json", path: "C:/preview/.pi/agent/models.json", exists: true },
            text: piFamilyModels.pi,
          };
        }
        return { file: { format: "yaml", path: "", exists: false }, text: "" };
      }
      throw new Error(`Unexpected command: ${command}`);
    },
  },
};

for (const value of [
  null,
  "",
  "__local_settings_json__",
  "__local_config_toml__",
]) {
  current = value;
  const result = await bridge.getSystemProviderChannels("claude");
  assert.equal(result.current, bridge.NATIVE_PROVIDER_ID);
  assert.equal(result.channels[0].isNative, true);
  assert.equal(result.channels.filter((item) => item.isCurrent).length, 1);
}
current = "relay";
assert.equal(
  (await bridge.getSystemProviderChannels("claude")).current,
  "relay",
);
current = "__disabled__";
assert.equal(
  (await bridge.getSystemProviderChannels("claude")).channels.some(
    (item) => item.isCurrent,
  ),
  false,
);
for (const engine of ["codex", "kimi", "grok"]) {
  const result = await bridge.getSystemProviderChannels(engine);
  assert.equal(
    result.channels[0].isNative,
    true,
    `${engine} must expose native configuration even without saved providers`,
  );
}
const ompChannels = (await bridge.getSystemProviderChannels("omp")).channels;
assert.ok(ompChannels.some((c) => c.id === "custom-omp" && c.baseUrl === "https://omp-relay.example.com"), "omp must load custom-omp provider channel from models.yml");
assert.equal(ompChannels.some((c) => c.isNative), true, "OMP built-in providers must remain selectable alongside custom providers");
const piChannels = (await bridge.getSystemProviderChannels("pi")).channels;
assert.ok(piChannels.some((c) => c.id === "custom-pi" && c.baseUrl === "https://pi-relay.example.com"), "pi must load custom-pi provider channel from models.json");
assert.equal(piChannels.some((c) => c.isNative), true, "PI built-in providers must remain selectable alongside custom providers");
const dshChannels = await bridge.getSystemProviderChannels("dsh");
assert.equal(dshChannels.current, bridge.NATIVE_PROVIDER_ID);
assert.deepEqual(dshChannels.channels.map(({ id, name, isNative }) => ({ id, name, isNative })),
  [{ id: bridge.NATIVE_PROVIDER_ID, name: '宿主服务配置', isNative: true }],
  'DSH needs a native service entry to recover from legacy independent channels');
const nativeClaude = (await bridge.getSystemProviderChannels("claude")).channels[0];
assert.equal(nativeClaude.baseUrl, "https://api.anthropic.com");
assert.equal(nativeClaude.apiKey, "sk-native");
assert.equal(nativeClaude.model, "claude-sonnet");
const nativeCodex = (await bridge.getSystemProviderChannels("codex")).channels[0];
assert.equal(nativeCodex.baseUrl, "https://api.openai.com/v1");
assert.equal(nativeCodex.apiKey, "sk-codex");
assert.equal(nativeCodex.model, "gpt-5");
const nativeKimi = (await bridge.getSystemProviderChannels("kimi")).channels[0];
assert.equal(nativeKimi.baseUrl, "https://api.moonshot.cn/v1");
assert.equal(nativeKimi.apiKey, "sk-kimi");
assert.equal(nativeKimi.model, "kimi-k2");
const nativeGrok = (await bridge.getSystemProviderChannels("grok")).channels[0];
assert.equal(nativeGrok.baseUrl, "https://api.x.ai");
assert.equal(nativeGrok.apiKey, "sk-grok");
assert.equal(nativeGrok.model, "grok-4");
assert.deepEqual(
  bridge.parseNativeOfficialFields("claude", [{
    path: "C:/x/settings.json",
    content: '{"env":{"ANTHROPIC_BASE_URL":"https://example.com","ANTHROPIC_API_KEY":"sk-alt"}}',
  }]),
  { baseUrl: "https://example.com", apiKey: "sk-alt", model: "" },
);
assert.deepEqual(
  bridge.parseNativeOfficialFields("pi", []),
  { baseUrl: "", apiKey: "", model: "" },
);
assert.notEqual(
  bridge.channelModelKey("claude", bridge.NATIVE_PROVIDER_ID),
  bridge.channelModelKey("codex", bridge.NATIVE_PROVIDER_ID),
);
assert.deepEqual(await bridge.getNativeModels("codex"), [
  { id: "codex-model" },
]);
const api = await loadModule("../src/api.ts");
const unusedBridgeCtx = { bridge: { invoke: async () => { throw new Error("unused"); } } };
const catalogCalls = () => calls.filter((item) => item.command === "list_engine_models");
const catalogCount = catalogCalls().length;
const nativeFromApi = await api.loadNativeChannelModels(unusedBridgeCtx, "claude", {
  baseUrl: "https://api.anthropic.com",
  apiKey: "sk-native",
});
assert.deepEqual(nativeFromApi.models, [{ id: "api:https://api.anthropic.com" }]);
assert.equal(nativeFromApi.authoritative, false);
assert.equal(catalogCalls().length, catalogCount, "native channel with Base URL must not use CLI catalog");
assert.ok(calls.some((item) => item.command === "fetch_provider_models"));
const nativeFromCatalog = await api.loadNativeChannelModels(unusedBridgeCtx, "grok", {
  baseUrl: "",
  apiKey: "",
});
assert.deepEqual(nativeFromCatalog.models, [{ id: "grok-model" }]);
assert.equal(nativeFromCatalog.authoritative, true);
assert.equal(catalogCalls().length, catalogCount + 1, "native channel without Base URL falls back to CLI catalog");

// Test native catalog caching & deduplication for slow CLIs (omp / pi)
const [ompCatalogA, ompCatalogB] = await Promise.all([
  bridge.getNativeCatalog("omp"),
  bridge.getNativeCatalog("omp"),
]);
assert.equal(ompCatalogA, ompCatalogB, "concurrent getNativeCatalog must share one inflight probe");
assert.equal(await bridge.getNativeCatalog("omp"), ompCatalogA, "warm native catalog must hit memory cache");
assert.equal(bridge.peekNativeCatalog("omp"), ompCatalogA, "peekNativeCatalog must return cached catalog synchronously");
assert.equal(bridge.peekSystemEngines(), null);
const optimistic = bridge.optimisticSystemEngines("claude");
assert.equal(optimistic.find((item) => item.id === "claude")?.disabled, false);
assert.equal(optimistic.find((item) => item.id === "codex")?.disabled, true);
const engineCalls = () => calls.filter((item) => item.command === "list_engines");
const [enginesA, enginesB] = await Promise.all([
  bridge.getSystemEngines(),
  bridge.getSystemEngines(),
]);
assert.equal(engineCalls().length, 1, "concurrent engine reads share one PATH probe");
assert.equal(enginesA, enginesB);
assert.equal(enginesA.some((item) => item.id === "kimi"), false);
assert.equal(enginesA.find((item) => item.id === "codex")?.disabled, true);
assert.equal(enginesA.find((item) => item.id === "claude")?.available, true);
assert.equal(await bridge.getSystemEngines(), enginesA);
assert.equal(engineCalls().length, 1, "warm engine cache must skip list_engines");
assert.equal(bridge.peekSystemEngines(), enginesA);

// Test force refresh for CLI upgrade/install detection
const forcedEngines = await bridge.getSystemEngines(true);
assert.equal(engineCalls().length, 2, "force getSystemEngines must bypass cache and re-probe PATH");
assert.deepEqual(forcedEngines, enginesA);

// Test catalog cache invalidation
bridge.invalidateNativeCatalogCache("omp");
assert.equal(bridge.peekNativeCatalog("omp"), null, "invalidateNativeCatalogCache must clear peek cache");
await bridge.getNativeCatalog("omp");
assert.ok(bridge.peekNativeCatalog("omp") !== null, "re-fetching after invalidate must repopulate cache");

const configCalls = () => calls.filter((item) => item.command === "get_cli_config");
const configCount = configCalls().length;
await Promise.all([
  bridge.getSystemProviderChannels("claude"),
  bridge.getSystemProviderChannels("codex"),
]);
assert.equal(configCalls().length, configCount + 1, "concurrent channel reads share one get_cli_config");
const engineCallsBeforePrefetch = engineCalls().length;
bridge.prefetchSystemSnapshot();
await Promise.resolve();
assert.equal(engineCalls().length, engineCallsBeforePrefetch, "prefetch must reuse warm engine cache");
assert.equal(
  calls.some(
    ({ command }) =>
      command.includes("write") || command === "set_current_provider",
  ),
  false,
  "Reading providers must not modify native configuration",
);
const writeCountBeforeSwitch = calls.length;
await bridge.setSystemCurrentProvider("codex", bridge.NATIVE_PROVIDER_ID);
await bridge.setSystemCurrentProvider("claude", "relay");
await bridge.setSystemCurrentProvider("claude", bridge.NATIVE_PROVIDER_ID);
const switchWrites = calls.slice(writeCountBeforeSwitch);
assert.deepEqual(
  switchWrites.map((item) => item.command),
  ["set_current_provider", "set_current_provider", "set_current_provider"],
  "explicit global default updates must call host set_current_provider",
);
assert.deepEqual(switchWrites[0].args, {
  engine: "codex",
  id: bridge.NATIVE_PROVIDER_ID,
});
assert.deepEqual(switchWrites[1].args, { engine: "claude", id: "relay" });
assert.deepEqual(switchWrites[2].args, {
  engine: "claude",
  id: bridge.NATIVE_PROVIDER_ID,
});
const configAfterSwitch = configCalls().length;
await bridge.getSystemProviderChannels("claude");
assert.equal(
  configCalls().length,
  configAfterSwitch + 1,
  "channel switch must invalidate get_cli_config cache",
);

let result = {
  code: 0,
  stdout: '{"status":"clean","files":[{"path":"fixture","status":"clean","rawMatches":0,"cleanMatches":1}]}\n',
  stderr: "diagnostic warning\n",
};
const ctx = { bridge: { invoke: async (command, args) => {
  assert.equal(command, "plugin_exec_run");
  assert.equal(args.bin, "node");
  assert.equal(args.args[0], "-e");
  assert.equal(args.args[2], "--");
  assert.match(args.args[1], /os\.homedir/);
  return result;
} } };
assert.equal((await scrub.checkScrubStatus(ctx)).status, "clean");
result = { code: 0, stdout: "", stderr: "" };
assert.equal(
  (await scrub.applyScrubPrompt(ctx)).success,
  false,
  "Empty output must never be reported as cleaned",
);
assert.equal((await scrub.restoreOfficialPrompt(ctx)).success, false);
result = { code: 1, stdout: '{"success":true,"patchedCount":2}', stderr: "" };
assert.equal(
  (await scrub.applyScrubPrompt(ctx)).success,
  false,
  "Failed process must never report success",
);
result = { code: 0, stdout: '{"status":"not_found"}', stderr: "" };
assert.equal((await scrub.checkScrubStatus(ctx)).status, "not_found");
assert.equal((await scrub.applyScrubPrompt(ctx)).success, false);
result = { code: 0, stdout: '{"success":true,"patchedCount":2}', stderr: "" };
assert.equal((await scrub.applyScrubPrompt(ctx)).success, false, "Counts alone do not verify a successful patch");
result = { code: 0, stdout: '{"success":true,"patchedCount":2,"status":"clean","files":[{"path":"fixture","status":"clean","rawMatches":0,"cleanMatches":2}]}', stderr: "" };
assert.equal((await scrub.applyScrubPrompt(ctx)).success, true);
const originalInvoke = window.__TAURI_INTERNALS__.invoke;
window.__TAURI_INTERNALS__.invoke = async command => {
  assert.equal(command, "get_app_settings");
  return { claudeBin: "/custom installation/claude" };
};
let forwardedTarget;
await scrub.applyScrubPrompt({ bridge: { invoke: async (_command, args) => {
  forwardedTarget = args.args[4];
  return result;
} } });
assert.equal(forwardedTarget, "/custom installation/claude", "Honor the host's executable override");
window.__TAURI_INTERNALS__.invoke = originalInvoke;
console.log("Native provider compatibility and scrub status checks passed.");

for (const engine of ["claude", "codex", "kimi", "grok", "pi", "omp"]) {
  assert.equal(bridge.independentChannelError(engine), null);
  for (const model of ["relay/custom", "claude-via-responses", "gpt-via-messages", "模型别名"]) {
    assert.equal(policy.modelSelectionError(engine, model), null, "Names cannot prove a wire protocol mismatch");
    assert.equal(policy.modelSelectionError(engine, model, { nativeIds: [], authoritative: false }), null);
    assert.notEqual(policy.modelSelectionError(engine, model, { nativeIds: [], authoritative: true }), null);
    assert.equal(policy.modelSelectionError(engine, model, { nativeIds: [model], authoritative: true }), null);
  }
  const channel = { id: "test", name: "Relay", baseUrl: "https://example.invalid", apiKey: "test-only", model: "alias" };
  const writeCount = calls.length;
  await bridge.applyCustomPluginChannelToEngine(ctx, engine, channel);
  await bridge.deleteCustomPluginChannel(engine, channel.id);
  const writes = calls.slice(writeCount);
  const hostId = bridge.pluginProviderId(channel.id);
  const isPiFamily = engine === "pi" || engine === "omp";
  const expectedCommands = isPiFamily
    ? [
        "pi_family_models_config_read",
        "pi_family_models_config_write",
        "upsert_provider",
        "pi_family_models_config_read",
        "pi_family_models_config_write",
        "delete_provider",
      ]
    : ["upsert_provider", "delete_provider"];
  assert.deepEqual(
    writes.map((item) => item.command),
    expectedCommands,
    `${engine} plugin channel ops must sync host providers`,
  );
  const upsert = writes.find((item) => item.command === "upsert_provider");
  const expectedJson = {
    name: "Relay",
    baseUrl: "https://example.invalid",
    apiKey: "test-only",
    model: "alias",
    ...(isPiFamily ? { api: "openai-completions" } : {}),
  };
  if (engine === "claude") {
    // Claude CLI 独立渠道默认注入 attribution 与 env.ENABLE_TOOL_SEARCH
    expectedJson.settingsConfig = {
      attribution: { commit: "", pr: "" },
      env: { ENABLE_TOOL_SEARCH: "true" },
    };
  }
  if (engine === "codex") {
    expectedJson.settingsConfig = {
      config: upsert.args.json.settingsConfig.config,
      auth: { OPENAI_API_KEY: "test-only" },
    };
    assert.match(upsert.args.json.settingsConfig.config, /requires_openai_auth = true/);
    assert.match(upsert.args.json.settingsConfig.config, /wire_api = "responses"/);
    assert.doesNotMatch(upsert.args.json.settingsConfig.config, /env_key/);
    assert.match(upsert.args.json.settingsConfig.config, new RegExp(hostId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.deepEqual(upsert.args, {
    engine,
    id: hostId,
    json: expectedJson,
  });
  if (isPiFamily) {
    const written = writes.find((item) => item.command === "pi_family_models_config_write");
    assert.match(written.args.text, /openai-completions/);
    assert.match(written.args.text, new RegExp(hostId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.equal(writes.some((item) => item.command === "set_current_provider"), false, "Plugin channel operations must not write the global default");
  assert.deepEqual(writes.find((item) => item.command === "delete_provider").args, { engine, id: hostId });
}
const pluginOmpChannel = { id: "custom_1", isPlugin: true };
assert.equal(
  bridge.qualifyEngineModel("omp", pluginOmpChannel, "gemini-3.1-pro-preview"),
  "plugin_model-switcher_custom_1/gemini-3.1-pro-preview",
);
assert.equal(
  bridge.qualifyEngineModel("omp", pluginOmpChannel, "plugin_model-switcher_custom_1/gemini-3.1-pro-preview"),
  "plugin_model-switcher_custom_1/gemini-3.1-pro-preview",
);
assert.equal(
  bridge.qualifyEngineModel("omp", pluginOmpChannel, "custom_1/gemini-3.1-pro-preview"),
  "plugin_model-switcher_custom_1/gemini-3.1-pro-preview",
);
assert.equal(
  bridge.displayEngineModel("omp", pluginOmpChannel, "plugin_model-switcher_custom_1/gemini-3.1-pro-preview"),
  "gemini-3.1-pro-preview",
);
assert.equal(
  bridge.qualifyEngineModel("omp", { id: "custom-omp" }, "omp-model-1"),
  "custom-omp/omp-model-1",
);
assert.equal(
  bridge.qualifyEngineModel("claude", pluginOmpChannel, "claude-sonnet"),
  "claude-sonnet",
);
assert.equal(
  bridge.qualifyEngineModel("omp", { id: bridge.NATIVE_PROVIDER_ID, isNative: true }, "google/gemini"),
  "google/gemini",
);
console.log("Plugin channel operations sync host providers without changing the global default.");
const parser = await loadModule("../src/pi-family-parser.ts");
const yaml = `providers:
  custom-omp:
    baseUrl: "https://omp-relay.example.com"
    apiKey: "sk-omp"
    models:
      - id: "omp-model-1"
        name: "OMP Model 1"
`;
const upserted = parser.upsertPiFamilyProviderText(yaml, "yaml", "plugin_model-switcher_test", {
  name: "Relay",
  baseUrl: "https://example.invalid",
  apiKey: "test-only",
  api: "anthropic-messages",
  model: "alias",
});
assert.match(upserted, /api: anthropic-messages/);
assert.match(upserted, /custom-omp:/);
assert.match(upserted, /plugin_model-switcher_test:/);
assert.match(upserted, /omp-model-1/);
const appendedModelsYaml = parser.upsertPiFamilyProviderText(
  upserted,
  "yaml",
  "plugin_model-switcher_test",
  {
    name: "Relay",
    baseUrl: "https://example.invalid",
    apiKey: "test-only",
    api: "anthropic-messages",
    model: "gemini-3.8-flash",
  },
);
assert.match(appendedModelsYaml, /- id: "alias"/);
assert.match(appendedModelsYaml, /- id: "gemini-3.8-flash"/);

const patchedMissingApi = parser.upsertPiFamilyProviderText(
  `providers:
  plugin_model-switcher_test:
    name: Relay
    baseUrl: https://example.invalid
    apiKey: test-only
    models:
      - id: alias
`,
  "yaml",
  "plugin_model-switcher_test",
  {
    name: "Relay",
    baseUrl: "https://example.invalid",
    apiKey: "test-only",
    api: "openai-completions",
    model: "alias",
  },
);
assert.match(patchedMissingApi, /api: openai-completions/);
assert.doesNotMatch(parser.removePiFamilyProviderText(upserted, "yaml", "plugin_model-switcher_test"), /plugin_model-switcher_test:/);
assert.match(parser.removePiFamilyProviderText(upserted, "yaml", "plugin_model-switcher_test"), /custom-omp:/);
// Last-provider deletion must emit an empty mapping, never YAML null; adding again must expand it.
for (const nl of ['\n', '\r\n']) {
  const onlyProvider = ['# config', 'providers: # custom channels', '  plugin_model-switcher_test:', '    models: []', 'defaults:', '  model: native', ''].join(nl);
  const empty = parser.removePiFamilyProviderText(onlyProvider, 'yaml', 'plugin_model-switcher_test');
  assert.ok(empty.includes('providers: {} # custom channels' + nl));
  assert.ok(empty.includes('defaults:' + nl + '  model: native'));
  assert.equal(parser.removePiFamilyProviderText(empty, 'yaml', 'plugin_model-switcher_test'), empty);
  const added = parser.upsertPiFamilyProviderText(empty, 'yaml', 'plugin_model-switcher_test', {
    name: 'Relay', baseUrl: 'https://example.invalid', apiKey: 'test-only', api: 'openai-completions', model: 'alias',
  });
  assert.ok(!added.includes('providers: {}'));
  assert.equal(parser.parsePiFamilyProviders(added, 'yaml')['plugin_model-switcher_test'].models[0].id, 'alias');
  const previous = piFamilyModels.omp;
  piFamilyModels.omp = onlyProvider;
  const callStart = calls.length;
  await bridge.deleteCustomPluginChannel('omp', 'test');
  assert.ok(piFamilyModels.omp.includes('providers: {}'));
  assert.equal(calls.slice(callStart).at(-1).command, 'delete_provider', 'Removing the final OMP provider reaches host deletion');
  piFamilyModels.omp = previous;
}
assert.deepEqual(JSON.parse(parser.removePiFamilyProviderText('{"providers":{"only":{"models":[]}}}', 'json', 'only')), { providers: {} });
console.log("OMP/PI plugin channels persist api protocol in models.yml.");
{
  const invoke = window.__TAURI_INTERNALS__.invoke;
  try {
    for (const engine of ['omp', 'pi']) {
      let written;
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        if (command === 'pi_family_models_config_read') return { text: engine === 'omp' ? 'providers: {}\n' : '{"providers":{}}', file: { format: engine === 'omp' ? 'yaml' : 'json' } };
        if (command === 'pi_family_models_config_write') { written = args.text; return {}; }
        throw Error(command);
      };
      await bridge.ensurePiFamilyModelConfigured(engine, { id: 'protocol-test', isPlugin: true, api: 'anthropic-messages', baseUrl: 'https://example.invalid', apiKey: 'test-only' }, 'alias');
      const provider = parser.parsePiFamilyProviders(written, engine === 'omp' ? 'yaml' : 'json')['plugin_model-switcher_protocol-test'];
      assert.equal(provider.api, 'anthropic-messages');
      assert.equal(provider.models[0].id, 'alias');
      const readable = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = (command, args) => command === 'pi_family_models_config_write'
        ? Promise.reject('read-only config') : readable(command, args);
      await assert.rejects(() => bridge.ensurePiFamilyModelConfigured(engine, { id: 'protocol-test', isPlugin: true }, 'alias'), /read-only config/);
    }
    for (const engine of ['kimi', 'grok']) {
      window.__TAURI_INTERNALS__.invoke = async (command) => {
        assert.equal(command, 'list_engine_models', 'Registry-based CLI must not use a relay /models ID as a selector');
        return { models: [{ id: 'provider/alias' }], authoritative: true };
      };
      const catalog = await api.loadNativeChannelModels(unusedBridgeCtx, engine, { baseUrl: 'https://example.invalid' }, true);
      assert.equal(catalog.models[0].id, 'provider/alias');
      assert.equal(catalog.authoritative, true);
    }
    const requests = [];
    window.__TAURI_INTERNALS__.invoke = () => new Promise(resolve => requests.push(resolve));
    bridge.invalidateNativeCatalogCache('omp');
    const older = bridge.getNativeCatalog('omp', true);
    const newer = bridge.getNativeCatalog('omp', true);
    await Promise.resolve();
    requests[1]({ models: [{ id: 'new-model' }], authoritative: true });
    await newer;
    requests[0]({ models: [{ id: 'old-model' }], authoritative: true });
    await older;
    assert.equal(bridge.peekNativeCatalog('omp').models[0].id, 'new-model', 'Late old probe cannot overwrite refreshed catalog');
  } finally { window.__TAURI_INTERNALS__.invoke = invoke; }
}
assert.notEqual(policy.modelSelectionError("codex", "alias", {
  modelProtocols: ["anthropic-messages"], engineProtocols: ["openai-responses"],
}), null);
assert.equal(policy.modelSelectionError("codex", "alias", {
  modelProtocols: ["openai-responses"], engineProtocols: ["openai-responses"],
}), null);
assert.notEqual(policy.modelSelectionError("codex", "default"), null);
// Exercise the actual embedded Node entrypoint without scanning or changing CLI files.
const executableCtx = { bridge: { invoke: async (_command, args) => {
  const stdout = execFileSync(process.execPath, [...args.args.slice(0, -1), "selftest"], {
    encoding: "utf8", windowsHide: true,
  });
  assert.equal(JSON.parse(stdout).ok, true);
  return { code: 0, stdout: '{"status":"clean","files":[{"path":"fixture","status":"clean","rawMatches":0,"cleanMatches":1}]}', stderr: "" };
} } };
assert.equal((await scrub.checkScrubStatus(executableCtx)).status, "clean");
console.log("Portable execution, host channel adapters and metadata-based model validation passed.");

const display = await loadModule("../src/session-display.ts");
{
  // 切换会话页签后渠道高亮必须跟随会话：优先读对话级记录，无记录则清空交由宿主重新确定
  const localSaved = { selectedCli: 'claude', selectedModel: '', effort: 'high', enable1MContext: false, selectedProviderId: 'leaked-from-other-session', activeChannelType: 'system' };
  const withSessions = {
    ...localSaved,
    sessionChannels: {
      A: { selectedCli: 'claude', selectedProviderId: 'provider-a', selectedModel: 'm', effort: 'high', enable1MContext: false, activeChannelType: 'system' },
      B: { selectedCli: 'claude', selectedProviderId: 'plugin_model-switcher_b', selectedModel: 'm', effort: 'high', enable1MContext: false, activeChannelType: 'plugin', activePluginChannelId: 'b' },
    },
  };
  const noProvider = { sessionKey: 'k', stableKey: 'A', selectedCli: 'claude', selectedModel: '', effort: 'high', enable1MContext: false };
  assert.equal(display.withSessionDisplay(withSessions, noProvider).selectedProviderId, 'provider-a',
    'A returning tab restores its own channel from the per-session record');
  const pluginTab = display.withSessionDisplay(withSessions, { ...noProvider, stableKey: 'B' });
  assert.equal(pluginTab.selectedProviderId, 'plugin_model-switcher_b', 'A plugin channel record survives a tab round-trip');
  assert.equal(pluginTab.activeChannelType, 'plugin');
  assert.equal(pluginTab.activePluginChannelId, 'b');
  const freshTab = display.withSessionDisplay(withSessions, { ...noProvider, stableKey: 'C' });
  assert.equal(freshTab.selectedProviderId, '', 'A tab without a record must not inherit another tab channel');
  assert.equal(freshTab.activeChannelType, 'system');
  assert.equal(freshTab.activePluginChannelId, undefined);
}
{
  const state = { selectedCli: 'omp', activeChannelType: 'plugin', activePluginChannelId: 'a', pluginChannels: { omp: [{ id: 'a' }, { id: 'b' }] } };
  const session = { sessionKey: 'session', selectedCli: 'omp', selectedModel: 'alias', effort: 'high', enable1MContext: false };
  const switched = display.withSessionDisplay(state, { ...session, selectedProviderId: bridge.pluginProviderId('b') });
  assert.equal(switched.activePluginChannelId, 'b', 'Each session resolves its own independent channel');
  const native = display.withSessionDisplay(state, { ...session, selectedProviderId: bridge.NATIVE_PROVIDER_ID });
  assert.equal(native.activeChannelType, 'system');
  assert.equal(native.activePluginChannelId, undefined);
}
const saved = { selectedCli: "codex", selectedModel: "global-model", effort: "high", enable1MContext: true };
let active = { engine: "claude", sessionId: "a", workspacePath: "/project", model: "session-a", effort: "low" };
globalThis.localStorage = { getItem: () => active ? JSON.stringify(active) : null };
let selection = display.readSessionDisplay();
assert.equal(selection.selectedCli, "claude");
assert.equal(selection.selectedModel, "session-a");
assert.equal(selection.effort, "low");
assert.equal(display.withSessionDisplay(saved, selection).enable1MContext, false);
const firstKey = selection.sessionKey;
active = { ...active, model: 'another-model', effort: 'ultra' };
assert.equal(display.readSessionDisplay().sessionKey, firstKey, 'Model/effort changes keep the flyout mounted');
active = { ...active, provider: 'another-channel' };
assert.equal(display.readSessionDisplay().sessionKey, firstKey, 'Channel changes keep the in-flight switch mounted');
active = { ...active, sessionId: "b", model: "session-b[1m]", effort: "max" };
selection = display.readSessionDisplay();
assert.notEqual(selection.sessionKey, firstKey);
assert.equal(selection.selectedModel, "session-b");
assert.equal(selection.enable1MContext, true);
assert.equal(selection.effort, "max");
active = { ...active, engine: "omp", model: "provider/grok-4.6[1m]" };
assert.equal(display.readSessionDisplay().enable1MContext, true, "OMP [1m] is 1M");
assert.equal(display.withSessionDisplay({ ...saved, selectedCli: 'omp' }, null).enable1MContext, true);
active = { engine: "claude", sessionId: "c", workspacePath: "/project" };
assert.equal(display.withSessionDisplay(saved, display.readSessionDisplay()).selectedModel, "",
  "An unknown session model must never use the plugin's global selection");

// Simulate the DOM's retained Fiber pointer after React commits its alternate.
const oldRoot = { return: null, stateNode: {} };
const newRoot = { return: null, stateNode: oldRoot.stateNode };
oldRoot.stateNode.current = newRoot;
const currentProps = { value: "claude", models: { claude: "history-c" }, efforts: { claude: "ultra" }, onModelChange() {} };
const oldMenu = { memoizedProps: { ...currentProps, models: { claude: "stale-a" } }, return: oldRoot };
const newMenu = { memoizedProps: currentProps, return: newRoot };
const button = { __reactFiber$test: { return: oldMenu, alternate: { return: newMenu } } };
globalThis.document = { querySelector: () => button };
selection = display.readSessionDisplay();
assert.equal(selection.selectedModel, "history-c", "Read the committed host model, including history fallback");
assert.equal(selection.effort, "ultra");
const conversation = { memoizedProps: { active: { ...active, model: "live-tab" } }, return: newRoot };
newMenu.return = conversation;
active = { ...active, model: "stale-storage" };
assert.equal(display.readSessionDisplay().selectedModel, "live-tab", "Mounted session wins over delayed persistence");
conversation.memoizedProps.active.provider = 'stale-session-provider';
assert.equal(display.readSessionDisplay().selectedProviderId, '', 'Native-config hosts ignore obsolete per-session channel bindings');
newMenu.memoizedProps.onChannelChange = () => {};
assert.equal(display.readSessionDisplay().selectedProviderId, 'stale-session-provider', 'Legacy hosts retain per-session channel bindings');
delete newMenu.memoizedProps.onChannelChange;
conversation.memoizedProps.active = null;
active = null;
assert.equal(display.readSessionDisplay().selectedModel, "history-c", "New chats use the host's engine default");

// Test session message history & activeModel/activeEffort resolution
const historySessionFiber = {
  memoizedProps: {
    active: {
      engine: "claude",
      sessionId: "s-1",
      workspacePath: "/p",
      model: "gpt-4o[1m]",
      effort: "xhigh",
    },
    session: {
      model: "gpt-4o[1m]",
      effort: "xhigh",
      messages: [{ role: "assistant", model: "gpt-4o-mini", effort: "medium" }],
    },
  },
  return: newRoot,
};
newMenu.return = historySessionFiber;
assert.equal(display.readSessionDisplay().selectedModel, "gpt-4o", "model from session wins over engine default");
assert.equal(display.readSessionDisplay().enable1MContext, true, "1M context detected from [1m] suffix");
assert.equal(display.readSessionDisplay().effort, "xhigh", "effort from session wins over engine default");

newMenu.memoizedProps.models = {};
const messageHistoryFiber = {
  memoizedProps: {
    messages: [
      { role: "assistant", model: "claude-3-5-sonnet", effort: "low" },
      { role: "assistant", model: "claude-3-7-sonnet[1m]", effort: "high" },
    ],
  },
  return: newRoot,
};
newMenu.return = messageHistoryFiber;
assert.equal(display.readSessionDisplay().selectedModel, "claude-3-7-sonnet", "Last used model in messages fallback wins");
assert.equal(display.readSessionDisplay().enable1MContext, true, "1M context detected in history message");
assert.equal(display.readSessionDisplay().effort, "high", "Last used effort in messages fallback wins");

delete globalThis.document;
assert.equal(display.readSessionDisplay(), null);
delete globalThis.localStorage;
console.log("Session display isolation, history/default resolution and committed React Fiber checks passed.");

const sync = await loadModule("../src/sync-host.ts");
const activeKey = "ccgui-next.activeSession:v1";
const tabsKey = "ccgui-next.openTabs:v1";
const pending = { engine: "codex", sessionId: null, workspacePath: "/project" };
const history = { ...pending, sessionId: "history", model: "keep-model" };
const storage = new Map([[activeKey, JSON.stringify(pending)], [tabsKey, JSON.stringify([pending, history])]]);
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
assert.equal(policy.sessionSelectionError("claude"), null, "A pending tab's engine is a preference, not a lock");
assert.notEqual(policy.sessionSelectionError("claude", history), null, "Existing sessions remain locked");
assert.notEqual(policy.sessionSelectionError("claude", pending, true), null, "First turn locks CLI before native ID arrives");
for (const raw of ["broken-json", JSON.stringify({ engine: "codex" })]) {
  storage.set(activeKey, raw);
  assert.notEqual(policy.sessionSelectionError("claude"), null, "Malformed state must not unlock switching");
}
storage.set(activeKey, "null");
assert.equal(policy.sessionSelectionError("claude"), null, "A persisted null means no active conversation");
storage.set(activeKey, JSON.stringify(history));
const footer = { memoizedProps: { active: pending, streaming: false }, return: null };
const hostCalls = [];
const menu = { memoizedProps: {
  value: "codex",
  onChange(engine) {
    hostCalls.push(["engine", engine]);
    const next = { ...pending, engine };
    storage.set(activeKey, JSON.stringify(next));
    storage.set(tabsKey, JSON.stringify([next, history]));
    footer.memoizedProps.active = next;
  },
  onModelChange: (engine, model) => hostCalls.push(["model", engine, model]),
  onEffortChange: (engine, effort) => hostCalls.push(["effort", engine, effort]),
}, return: footer };
globalThis.document = { querySelector: () => ({ __reactFiber$test: { return: menu } }) };
assert.equal(sync.hostSessionSelectionError("claude"), null, "Live new tab wins over stale stored history");
footer.memoizedProps.streaming = true;
await assert.rejects(() => sync.applyModelSelectionToHost({ engine: "claude", model: "claude-test" }), /当前会话/);
assert.equal(hostCalls.length, 0, "Streaming guard runs before any host callback");
footer.memoizedProps.streaming = false;
const invokeBeforeSwitch = window.__TAURI_INTERNALS__.invoke;
window.__TAURI_INTERNALS__.invoke = async command => {
  assert(["get_app_settings", "update_app_settings"].includes(command));
  return {};
};
await sync.applyModelSelectionToHost({ engine: "claude", model: "claude-test", effort: "high" });
assert.deepEqual(hostCalls, [["engine", "claude"], ["model", "claude", "claude-test"], ["effort", "claude", "high"]]);
assert.equal(JSON.parse(storage.get(activeKey)).engine, "claude");
assert.equal(JSON.parse(storage.get(activeKey)).model, "claude-test");
assert.deepEqual(JSON.parse(storage.get(tabsKey))[1], history, "Switching a pending tab leaves history untouched");
{
  footer.memoizedProps.active = pending;
  const strictGuard = sync.captureHostSessionGuard('claude');
  const modelFollowupGuard = sync.captureHostSessionGuard('claude', true);
  await sync.applyModelSelectionToHost({ engine: 'claude', model: 'pending-target' });
  modelFollowupGuard();
  assert.throws(strictGuard, /会话已变化/, 'IPC guards never allow an engine change while pending');
  footer.memoizedProps.active = { ...pending, engine: 'claude', workspacePath: '/different' };
  assert.throws(modelFollowupGuard, /会话已变化/, 'Intended CLI retargeting cannot authorize a different tab');
}
for (const engine of ['omp', 'pi', 'codex', 'grok', 'kimi', 'dsh', 'agy', 'claude']) {
  for (const enabled of [true, false]) {
    const model = engine === 'claude' ? 'sonnet' : 'plugin_model-switcher_custom_1789396676885/grok-4.6';
    footer.memoizedProps.active = { ...pending, engine };
    hostCalls.length = 0;
    let writtenSettings;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      assert(['get_app_settings', 'update_app_settings'].includes(command), 'Context selection must not write CLI native config');
      if (command === 'update_app_settings') writtenSettings = args.settings;
      return {};
    };
    await sync.applyModelSelectionToHost({ engine, model: `${model}[1m]`, enable1M: enabled });
    const expected = enabled ? `${model}[1m]` : model;
    assert.equal(hostCalls.find(call => call[0] === 'model')[2], expected, `${engine} must use its own model selector syntax`);
    assert.equal(JSON.parse(storage.get(activeKey)).model, expected);
    assert.equal(writtenSettings.defaultModels[engine], expected);
  }
}
footer.memoizedProps.active = history;
await assert.rejects(() => sync.applyModelSelectionToHost({ engine: "claude", model: "claude-test" }), /当前会话/);
console.log('Engine-specific context selectors, persisted recovery and streaming-safe mounted recovery passed.');
const React = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
window.React = React;
const { EffortSection } = await loadModule('../src/components/EffortSection.tsx');
for (const engine of ['omp', 'pi', 'codex', 'claude']) {
  const html = renderToStaticMarkup(React.createElement(EffortSection, {
    effort: 'high', enable1M: true, onChange() {}, onToggle1M() {},
  }));
  assert.equal(html.includes('disabled=""'), false, `${engine} 1M switch must stay enabled`);
  assert.equal(html.includes('aria-checked="true"'), true, `${engine} 1M switch must stay on`);
}
delete window.React;
window.__TAURI_INTERNALS__.invoke = invokeBeforeSwitch;
const channelCalls = [];
menu.memoizedProps.onChannelChange = (engine, providerId) => {
  channelCalls.push([engine, providerId]);
  // The host callback returns void while its backend mutation is still pending.
  setTimeout(() => { menu.memoizedProps.selectedChannels = { [engine]: providerId }; }, 40);
};
for (const engine of ['dsh', 'agy', 'opencode', 'qoder', 'qoder-cn']) {
  footer.memoizedProps.active = null;
  storage.set(activeKey, 'null');
  const storedBefore = [...storage];
  const before = calls.length;
  const callbacksBefore = channelCalls.length;
  // 4196fd3 起独立渠道白名单已移除：independentChannelError 对所有引擎返回 null，
  // 这些 CLI 与其它引擎一样可选独立渠道。该行为由 src/system-bridge.test.ts 守护。
  for (const providerId of [
    bridge.pluginProviderId('unsupported'),
    'system-custom',
    bridge.NATIVE_PROVIDER_ID,
    '__local_config_toml__',
    '',
  ]) {
    await sync.applyChannelSelectionToHost({ engine, providerId });
    assert.deepEqual(channelCalls.at(-1), [engine, providerId], `${engine}: channel selection reaches the host`);
  }
  assert.equal(calls.length, before, `${engine}: host-delegated channel switch must not invoke IPC itself`);
  assert.equal(channelCalls.length, callbacksBefore + 5, `${engine}: every selection delegates to the host once`);
  assert.deepEqual([...storage], storedBefore, `${engine}: host-delegated selection must not touch plugin storage`);
}
console.log('Independent and native channels are selectable on every engine and delegate to the host.');
for (const session of [pending, history, null]) {
  menu.memoizedProps.selectedChannels = { codex: 'before' };
  footer.memoizedProps.active = session;
  storage.set(activeKey, JSON.stringify(session));
  storage.set(tabsKey, JSON.stringify([pending, history]));
  const before = calls.length;
  const providerId = bridge.pluginProviderId("test");
  await sync.applyChannelSelectionToHost({ engine: "codex", providerId });
  assert.equal(menu.memoizedProps.selectedChannels.codex, providerId, 'Wait for the committed host selection');
  assert.deepEqual(channelCalls.at(-1), ["codex", providerId]);
  assert.equal(calls.length, before, "Channel selection must not write global defaults, including blank or absent sessions");
  const stored = JSON.parse(storage.get(activeKey));
  assert.deepEqual(stored, session ? { ...session, provider: providerId } : null);
  assert.deepEqual(JSON.parse(storage.get(tabsKey)), [pending, history].map(tab =>
    session && tab.sessionId === session.sessionId ? { ...tab, provider: providerId } : tab));
}
{
  footer.memoizedProps.active = history;
  storage.set(activeKey, JSON.stringify(pending));
  storage.set(tabsKey, JSON.stringify([pending, history]));
  await sync.applyChannelSelectionToHost({ engine: 'codex', providerId: 'history-only' });
  assert.deepEqual(JSON.parse(storage.get(activeKey)), pending, 'Delayed persistence from another tab is not patched');
  assert.deepEqual(JSON.parse(storage.get(tabsKey)), [pending, { ...history, provider: 'history-only' }]);
}
{
  const callback = menu.memoizedProps.onChannelChange;
  menu.memoizedProps.onChannelChange = () => { throw Error('host rejected channel'); };
  const before = storage.get(activeKey);
  await assert.rejects(() => sync.applyChannelSelectionToHost({ engine: 'codex', providerId: 'rejected' }), /host rejected channel/);
  assert.equal(storage.get(activeKey), before, 'Rejected host change must not persist a different provider');
  menu.memoizedProps.onChannelChange = callback;
}
{
  const callback = menu.memoizedProps.onChannelChange;
  menu.memoizedProps.onChannelChange = () => {};
  const before = storage.get(activeKey);
  await assert.rejects(() => sync.applyChannelSelectionToHost({ engine: 'codex', providerId: 'not-accepted' }), /未确认/);
  assert.equal(storage.get(activeKey), before, 'Silent host rejection cannot persist a successful switch');
  menu.memoizedProps.onChannelChange = callback;
}
{
  const callback = menu.memoizedProps.onChannelChange;
  const session = footer.memoizedProps.active;
  const before = storage.get(activeKey);
  menu.memoizedProps.onChannelChange = () => {
    setTimeout(() => { footer.memoizedProps.active = { ...history, sessionId: 'another-tab' }; }, 10);
  };
  await assert.rejects(() => sync.applyChannelSelectionToHost({ engine: 'codex', providerId: 'late-channel' }), /会话已变化/);
  assert.equal(storage.get(activeKey), before, 'Changing tabs stops the pending channel operation before storage/model updates');
  footer.memoizedProps.active = session;
  menu.memoizedProps.onChannelChange = callback;
}
{
  delete menu.memoizedProps.onChannelChange;
  delete menu.memoizedProps.selectedChannels;
  menu.memoizedProps.value = 'codex';
  footer.memoizedProps.active = history;
  storage.set(activeKey, JSON.stringify(history));
  const storedBefore = [...storage];
  const events = [];
  const dispatch = window.dispatchEvent;
  window.dispatchEvent = event => { events.push(event.type); };
  const nativeCalls = [];
  let nativeCurrent = 'before';
  const invokeNative = async (command, args) => {
    nativeCalls.push({ command, args });
    if (command === 'set_current_provider') { nativeCurrent = args.id; return; }
    throw Error(`Unexpected IPC: ${command}`);
  };
  window.__TAURI_INTERNALS__.invoke = invokeNative;
  // set_current_provider 只改宿主自己的 ProviderSection.current，不落盘到 CLI 的配置文件
  // （宿主在 spawn 时注入环境变量），所以不存在需要用户二次确认的破坏性写入。
  const choose = providerId => sync.applyChannelSelectionToHost({ engine: 'codex', providerId });
  assert.equal(nativeCurrent, 'before');
  assert.deepEqual(events, []);

  for (const [requested, expected] of [['', bridge.NATIVE_PROVIDER_ID], ['__local_config_toml__', bridge.NATIVE_PROVIDER_ID], [bridge.NATIVE_PROVIDER_ID, bridge.NATIVE_PROVIDER_ID], ['local', 'local']]) {
    await choose(requested); // Promise<void>：不抛错即成功，成败只看宿主侧的已提交选择
    assert.equal(nativeCurrent, expected, 'The reserved native ID cannot select a custom provider named local');
  }
  assert.deepEqual([...storage], storedBefore, 'Native file selection does not invent a session-level provider binding');
  assert.equal(events.filter(type => type === 'ccgui:channel-changed').length, 4);
  const eventCount = events.length;
  const currentBefore = nativeCurrent;
  window.__TAURI_INTERNALS__.invoke = async (command, args) => {
    if (command === 'set_current_provider') { nativeCalls.push({ command, args }); throw Error('native write denied'); }
    return invokeNative(command, args);
  };
  const writesBefore = nativeCalls.filter(call => call.command === 'set_current_provider').length;
  await assert.rejects(() => choose(bridge.NATIVE_PROVIDER_ID), /native write denied/);
  assert.equal(nativeCalls.filter(call => call.command === 'set_current_provider').length, writesBefore + 1, 'Native failure is not retried as another provider');
  assert.equal(nativeCurrent, currentBefore);
  assert.deepEqual([...storage], storedBefore);
  assert.equal(events.length, eventCount, 'Rejected IPC must not emit success events');
  window.__TAURI_INTERNALS__.invoke = invokeNative;
  const otherSession = { ...history, sessionId: 'another-tab', model: 'untouched' };
  const switchSession = () => { footer.memoizedProps.active = otherSession; storage.set(activeKey, JSON.stringify(otherSession)); };
  window.__TAURI_INTERNALS__.invoke = async (command, args) => {
    const result = await invokeNative(command, args);
    if (command === 'set_current_provider') switchSession();
    return result;
  };
  const hostCallsBefore = hostCalls.length;
  await assert.rejects(async () => {
    await choose('late-ipc');
    await sync.applyModelSelectionToHost({ engine: 'codex', model: 'wrong-tab' });
  }, /会话已变化/);
  assert.deepEqual(JSON.parse(storage.get(activeKey)), otherSession, 'IPC completion cannot patch another same-engine session');
  assert.equal(hostCalls.length, hostCallsBefore, 'No follow-up model callback after a tab switch');
  assert.equal(events.length, eventCount);
  window.__TAURI_INTERNALS__.invoke = invokeBeforeSwitch;
  window.dispatchEvent = dispatch;
}
console.log('Native channel confirmation, canonical IDs, IPC errors and cross-session cancellation passed.');
delete globalThis.document;
const beforeFallback = calls.length;
storage.set(activeKey, JSON.stringify(pending));
await assert.rejects(() => sync.applyChannelSelectionToHost({ engine: "codex", providerId: "relay" }), /无法连接/);
assert.deepEqual(JSON.parse(storage.get(activeKey)), pending, 'Missing host callback must not fake a successful switch');
assert.equal(calls.length, beforeFallback, "Missing host callbacks must not fall back to writing global defaults");
delete globalThis.localStorage;
console.log("Pending CLI selection, live session guards, streaming locks and host retargeting passed.");

const themes = await loadModule("../src/theme-manager.ts");
const { THEME_PALETTES } = await loadModule("../src/theme-palette.ts");
const luminance = hex => {
  const rgb = hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
for (const [name, variants] of Object.entries(THEME_PALETTES)) {
  for (const [mode, colors] of Object.entries(variants)) {
    assert(contrast(colors.text, colors.canvas) >= 4.5, `${name}/${mode}: timeline text contrast`);
    assert(contrast(colors.muted, colors.surface) >= 4.5, `${name}/${mode}: secondary text contrast`);
    assert(contrast("#ffffff", colors.accent) >= 4.5, `${name}/${mode}: user bubble text contrast`);
  }
}
const tabCss = themes.generateThemeCss(themes.DEFAULT_THEME_CONFIG);
assert.match(tabCss, /\[role="tablist"\] > div\[data-tab-key\]:has\(\[role="tab"\]\[aria-selected="true"\]\)/);

let savedTheme = { preset: "nordic", canvasStyle: "diagonal", enableGlassmorphism: false, customCss: ".user-rule { color: red; }" };
let activeStyles = 0;
const themeCtx = {
  storage: { get: async () => savedTheme, set: async (_key, value) => { savedTheme = value; } },
  theme: { injectCss: () => { activeStyles++; return () => { activeStyles--; }; } },
};
const manager = new themes.GuiThemeManager(themeCtx);
await manager.init();
assert.equal(manager.getConfig().canvasStyle, "plain", "Migrate old theme settings with new defaults");
assert.equal(manager.getConfig().enableTabPolish, true, "Default tab polish to enabled");
await manager.updateConfig({ preset: "graphite", canvasStyle: "grid" });
assert.equal(activeStyles, 1, "Live theme replacement must not accumulate stylesheets");
assert.equal(savedTheme.preset, "graphite");
assert.equal(savedTheme.canvasStyle, 'plain', 'Legacy texture values must normalize on save');
assert.equal(savedTheme.customCss, ".user-rule { color: red; }");
manager.dispose();
assert.equal(activeStyles, 0);
console.log("Theme contrast, legacy settings migration, persistence and stylesheet cleanup passed.");

const customization = await loadModule("../src/theme-customization.ts");
assert.equal(customization.customThemeColor(undefined, { light: { accent: '#24685a' } }, 'ocean'), '#24685a', 'Reuse legacy custom accent');
for (const seed of ['#ffffff', '#000000', '#ffff00', '#00ff00', '#123456']) {
  const palette = customization.paletteFromColor(seed);
  for (const colors of Object.values(palette)) {
    assert(contrast('#ffffff', colors.accent) >= 4.5, `${seed}: button labels must remain readable`);
    assert(contrast(colors.text, colors.canvas) >= 4.5, `${seed}: canvas text must remain readable`);
  }
}
const basePalette = customization.customPaletteBase("ocean");
const sanitized = customization.normalizePalette({ light: { accent: "red; } body { display:none" }, dark: { accent: "#884455" } }, basePalette);
assert.equal(sanitized.light.accent, basePalette.light.accent);
assert.equal(sanitized.dark.accent, "#884455");
const themeStore = new Map();
const mediaWrites = [];
let sheets = 0;
const mediaCtx = {
  storage: {
    get: async key => themeStore.get(key) ?? null,
    set: async (key, value) => { mediaWrites.push(key); themeStore.set(key, value); },
  },
  theme: { injectCss: () => { sheets++; return () => { sheets--; }; } },
};
const mediaManager = new themes.GuiThemeManager(mediaCtx);
await mediaManager.init();
await mediaManager.updateConfig({ paletteMode: 'custom', customAccent: '#24685a' });
await Promise.all([mediaManager.updateConfig({ customAccent: '#305f8a' }), mediaManager.updateConfig({ customAccent: '#884455' })]);
assert.equal(themeStore.get('theme_config').customAccent, '#884455', 'Rapid writes must preserve the latest value');
assert.equal(mediaWrites.every(key => key === 'theme_config'), true, 'Theme state lives in a single storage key');
assert.equal(themeStore.get('theme_config').canvasStyle, 'plain', 'Canvas stays plain after the background feature removal');
assert.equal(sheets, 1, 'Keep exactly one theme stylesheet');
mediaManager.dispose();
assert.equal(sheets, 0);
const restoredManager = new themes.GuiThemeManager(mediaCtx);
await restoredManager.init();
assert.equal(restoredManager.getConfig().customAccent, '#884455', 'Restore the single custom theme color');
assert.equal(sheets, 1, 'Reactivation re-injects one stylesheet');
restoredManager.dispose();
assert.equal(sheets, 0);
console.log('Custom palette sanitization, ordered saves and stylesheet cleanup passed.');

console.log('All host compatibility contracts passed.');
