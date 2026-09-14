// Opt-in integration probe: fake credentials, disposable config, loopback responses.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
const scrub = require("./scrub-core.cjs");

async function main() {
  const target = scrub.run("check", process.argv[2]).files[0].path;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ccgui-request-probe-"));
  let launchTarget = target;
  const requests = [];
  let phase = "before-patch";
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = {}; }
    if (!req.url.startsWith("/v1/messages")) { res.writeHead(200); res.end("{}"); return; }
    const system = typeof body.system === "string" ? body.system : (body.system || []).map(block => block.text || "").join("\n");
    requests.push({ phase, rawSdkMarker: scrub.RULES.some(rule => system.includes(rule.raw.toString())),
      agentSdkMarker: system.includes(scrub.RULES.find(rule => rule.id === "agent-sdk").raw.toString()),
      replacementMarker: system.includes(scrub.CLEAN_TEXT),
      blockCount: Array.isArray(body.system) ? body.system.length : 1,
      probeSnapshot: system.includes("CCGUI_SNAPSHOT_BEFORE_PATCH"),
    });
    const message = { id: "msg_probe", type: "message", role: "assistant", model: body.model,
      content: [{ type: "text", text: "OK" }], stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 } };
    if (!body.stream) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(message)); return; }
    res.setHeader("Content-Type", "text/event-stream");
    for (const event of [
      { type: "message_start", message: { ...message, content: [], stop_reason: null } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "OK" } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } },
      { type: "message_stop" },
    ]) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    res.end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const env = {};
  for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "WINDIR", "PATHEXT", "COMSPEC", "LANG", "LC_ALL"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, { HOME: root, USERPROFILE: root, APPDATA: root, LOCALAPPDATA: root,
    TMP: root, TEMP: root, TMPDIR: root, CLAUDE_CONFIG_DIR: path.join(root, "config"),
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`,
    ANTHROPIC_API_KEY: "local-probe-not-a-real-key", ANTHROPIC_AUTH_TOKEN: "local-probe-not-a-real-key",
    DISABLE_AUTOUPDATER: "1", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  });
  const run = (extra) => new Promise((resolve, reject) => {
    const js = /\.[cm]?js$/.test(launchTarget);
    const child = spawn(js ? process.execPath : launchTarget, [
      ...(js ? [launchTarget] : []), "-p", "--input-format", "stream-json", "--output-format", "stream-json",
      "--verbose", "--setting-sources", "", "--tools", "", "--strict-mcp-config",
      "--disable-slash-commands", "--no-chrome", "--model", "claude-probe", ...extra,
    ], { cwd: root, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stdout.resume();
    child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-2000); });
    const timeout = setTimeout(() => child.kill(), 25000);
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.on("close", code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Probe exit ${code}: ${stderr}`)); });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ type: "user", message: { role: "user", content: "Reply OK." } }) + "\n");
  });
  try {
    await run(["--no-session-persistence"]);
    // Patch only a disposable copy; never modify the installed CLI during a probe.
    launchTarget = path.join(root, "probe-cli" + path.extname(target));
    fs.copyFileSync(target, launchTarget);
    fs.chmodSync(launchTarget, fs.statSync(target).mode);
    const patch = scrub.run("apply", launchTarget);
    assert.equal(patch.success, true, patch.message);
    phase = "new-session";
    await run(["--no-session-persistence"]);
    const id = randomUUID();
    phase = "snapshot-seed";
    await run(["--session-id", id, "--system-prompt", scrub.RULES.find(rule => rule.id === "agent-sdk").raw.toString() + " CCGUI_SNAPSHOT_BEFORE_PATCH", "--system-prompt-snapshot", "on"]);
    phase = "snapshot-resume";
    await run(["--resume", id, "--system-prompt", "CCGUI_SNAPSHOT_AFTER_PATCH", "--system-prompt-snapshot", "on"]);
    phase = "snapshot-off";
    await run(["--resume", id, "--system-prompt", "CCGUI_SNAPSHOT_AFTER_PATCH", "--system-prompt-snapshot", "off"]);
    console.log(JSON.stringify({ target, requests }, null, 2));
    const captured = name => requests.filter(request => request.phase === name);
    for (const name of ["before-patch", "new-session", "snapshot-seed", "snapshot-resume", "snapshot-off"]) {
      assert.ok(captured(name).length, `No request captured for ${name}`);
    }
    assert.ok(captured("new-session").every(request => !request.rawSdkMarker), "Fresh requests still contain the original SDK marker");
    assert.ok(captured("new-session").every(request => request.replacementMarker), "Fresh requests do not contain the requested replacement");
    assert.ok(captured("snapshot-seed").some(request => request.rawSdkMarker), "Snapshot fixture was not sent");
    assert.ok(captured("snapshot-resume").some(request => request.rawSdkMarker), "Snapshot replay was not reproduced on this CLI version");
    assert.ok(captured("snapshot-off").every(request => !request.rawSdkMarker), "Disabling snapshots did not refresh the prompt");
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
