const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const scrub = require("./scrub-core.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ccgui-scrub-test-"));
const source = fs.readFileSync(path.join(__dirname, "scrub-core.cjs"), "utf8");
try {
  const file = path.join(root, "cli.js");
  const unrelated = path.join(root, "other-cli.js");
  const original = Buffer.concat([Buffer.from("header:"), scrub.RAW, Buffer.from(";"), scrub.RAW]);
  fs.writeFileSync(file, original);
  fs.writeFileSync(unrelated, original);
  assert.equal(scrub.run("check", file).status, "unscrubbed");
  assert.equal(scrub.run("apply", file).patchedCount, 2);
  assert.equal(scrub.run("check", file).status, "clean");
  assert.equal(fs.statSync(file).size, original.length);
  assert.deepEqual(fs.readFileSync(unrelated), original, "Only the selected install is patched");
  assert.equal(scrub.run("apply", file).patchedCount, 0);
  // Simulate an updated executable with an old .orig.bak file beside it.
  const updated = Buffer.concat([fs.readFileSync(file), Buffer.from("new version bytes")]);
  fs.writeFileSync(file, updated);
  assert.equal(scrub.run("restore", file).success, true);
  assert.ok(fs.readFileSync(file).subarray(-17).equals(Buffer.from("new version bytes")));
  assert.equal(scrub.run("check", file).status, "unscrubbed");
  fs.writeFileSync(file, "unsupported prompt variant");
  assert.equal(scrub.run("apply", file).success, false, "Unknown versions must not succeed");
  assert.equal(scrub.run("restore", file).success, false, "Zero restored markers is not success");
  assert.equal(scrub.overall([{ status: "clean" }, { status: "unknown" }]), "unknown");

  for (const rule of scrub.RULES) {
    assert.equal(rule.raw.length, rule.clean.length, `${rule.id} must preserve byte offsets`);
    assert.equal(rule.clean.toString().trimEnd(), "You are Claude Code, Anthropic's official CLI for Claude.");
    fs.writeFileSync(file, rule.raw);
    assert.equal(scrub.run("apply", file).patchedCount, 1);
    assert.deepEqual(fs.readFileSync(file), rule.clean);
    assert.equal(scrub.run("check", file).files[0].cleanMatches, 1, "Padded prefixes must not be counted twice");
    assert.equal(scrub.run("restore", file).restoredCount, 1);
    assert.deepEqual(fs.readFileSync(file), rule.raw, "Each SDK phrase restores to its own original");
  }
  const sdk = scrub.RULES.find(rule => rule.id === "agent-sdk");
  const mixed = Buffer.concat([scrub.CLEAN, Buffer.from("|"), sdk.raw]);
  fs.writeFileSync(file, mixed);
  assert.equal(scrub.run("check", file).status, "unscrubbed", "Legacy patch must not mask the remaining SDK phrase");
  assert.equal(scrub.run("apply", file).patchedCount, 1);
  assert.equal(scrub.run("check", file).files[0].cleanMatches, 2);
  assert.equal(scrub.run("apply", file).patchedCount, 0);
  assert.equal(scrub.run("restore", file).restoredCount, 2);
  assert.deepEqual(fs.readFileSync(file), Buffer.concat([scrub.RAW, Buffer.from("|"), sdk.raw]));

  // npm launchers across the supported systems, with spaces in installation paths.
  const install = path.join(root, "install with spaces");
  const entry = path.join(install, "node_modules", "@anthropic-ai", "claude-code", "cli.js");
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(entry, original);
  for (const [name, text] of [
    ["claude.cmd", '"%~dp0\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*'],
    ["claude.ps1", '& node "$basedir/node_modules/@anthropic-ai/claude-code/cli.js" $args'],
    ["claude", '#!/bin/sh\nexec node "$basedir/node_modules/@anthropic-ai/claude-code/cli.js" "$@"'],
  ]) {
    const wrapper = path.join(install, name);
    fs.writeFileSync(wrapper, text);
    assert.deepEqual(scrub.resolveTargets(wrapper), [fs.realpathSync(entry)]);
  }
  if (process.platform !== "win32") {
    const link = path.join(root, "claude");
    fs.symlinkSync(entry, link);
    assert.deepEqual(scrub.resolveTargets(link), [fs.realpathSync(entry)]);
  }
  // Exercise denied writes without depending on root/admin permission semantics.
  const fakeFs = Object.create(fs);
  fakeFs.writeFileSync = () => { const error = new Error("locked"); error.code = "EACCES"; throw error; };
  const sandbox = { Buffer, require: name => name === "node:fs" ? fakeFs : require(name),
    module: { exports: {} }, __filename: "fixture-module.cjs" };
  vm.runInNewContext(source, sandbox);
  const denied = sandbox.module.exports.run("apply", entry);
  assert.equal(denied.success, false);
  assert.equal(denied.errors[0].error, "EACCES");
  assert.deepEqual(fs.readFileSync(entry), original);
  fakeFs.writeFileSync = () => {};
  const ignored = sandbox.module.exports.run("apply", entry);
  assert.equal(ignored.success, false, "A write that did not persist must fail readback verification");
  assert.match(ignored.errors[0].error, /verification failed/);

  for (const args of [[path.join(__dirname, "scrub-core.cjs"), "selftest"], ["-e", source, "--", "selftest"]]) {
    const result = execFileSync(process.execPath, args, { encoding: "utf8", windowsHide: true });
    assert.equal(JSON.parse(result).ok, true);
  }
  console.log("Scrub target resolution, exact writes, readback, restore and failure checks passed.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
