#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const CLEAN_TEXT = "You are Claude Code, Anthropic's official CLI for Claude.";
const RAW = Buffer.from("You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK.");
const CLEAN = Buffer.from(CLEAN_TEXT.padEnd(RAW.length, " "));
// Longest first: the shorter padded replacement is a prefix of the longer one.
const RULES = [
  { id: "cli-sdk", raw: RAW, clean: CLEAN },
  { id: "agent-sdk", raw: Buffer.from("You are a Claude agent, built on Anthropic's Claude Agent SDK."),
    clean: Buffer.from(CLEAN_TEXT.padEnd(Buffer.byteLength("You are a Claude agent, built on Anthropic's Claude Agent SDK."), " ")) },
].sort((a, b) => b.raw.length - a.raw.length);

function count(buffer, needle) {
  let total = 0;
  for (let i = buffer.indexOf(needle); i !== -1; i = buffer.indexOf(needle, i + needle.length)) total++;
  return total;
}

function replace(buffer, from, to) {
  const result = Buffer.from(buffer);
  for (let i = result.indexOf(from); i !== -1; i = result.indexOf(from, i + from.length)) to.copy(result, i);
  return result;
}

function realFile(file) {
  try { return fs.statSync(file).isFile() ? fs.realpathSync(file) : null; } catch { return null; }
}

function resolveLauncher(target) {
  if (target) {
    const expanded = target.startsWith("~/") || target.startsWith("~\\")
      ? path.join(os.homedir(), target.slice(2)) : target;
    const resolved = realFile(expanded);
    if (!resolved) throw new Error("Configured Claude CLI does not exist: " + target);
    return resolved;
  }
  // Match executable PATH lookup; never patch every installed CLI version.
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of (process.env.PATH || "").split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const file = realFile(path.join(dir.replace(/^"|"$/g, ""), "claude" + extension));
      if (file) return file;
    }
  }
  throw new Error("Claude CLI not found on PATH; configure its executable path in the host settings");
}

function packageRelative(value) {
  const relative = String(value || "").replace(/\\/g, "/");
  if (!relative || relative.split("/").some((part) => !part || part === "." || part === "..")) return null;
  return relative;
}

function insideDir(root, file) {
  const rel = path.relative(root, file);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function resolveTargets(launcher, visited = new Set()) {
  const file = fs.realpathSync(launcher);
  if (visited.has(file) || visited.size >= 12) throw new Error("CLI launcher cycle: " + file);
  visited.add(file);
  const buffer = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  const native = buffer.subarray(0, 2).toString() === "MZ" ||
    buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
    ["cffaedfe", "cefaedfe", "feedfacf", "feedface", "cafebabe", "bebafeca"].includes(buffer.subarray(0, 4).toString("hex"));
  if (native || ext === ".js" || ext === ".mjs" || ext === ".cjs") return [file];
  if (buffer.length > 64 * 1024) throw new Error("Unrecognized CLI executable format: " + file);
  const text = buffer.toString("utf8");
  // npm sh/cmd/PowerShell launchers all identify the same package entrypoint.
  const entry = text.match(/@anthropic-ai[/\\]claude-code[/\\]([^"'\s]+)/);
  if (entry) {
    const relative = packageRelative(entry[1]);
    const pkgRoot = path.resolve(path.dirname(file), "node_modules", "@anthropic-ai", "claude-code");
    const target = relative ? path.resolve(pkgRoot, relative) : "";
    if (!relative || !insideDir(pkgRoot, target)) {
      throw new Error("Unsupported CLI wrapper; configure the actual executable path: " + file);
    }
    const realTarget = realFile(target);
    let realRoot;
    try { realRoot = fs.realpathSync(pkgRoot); } catch { realRoot = ""; }
    if (!realTarget || !realRoot || !insideDir(realRoot, realTarget)) {
      throw new Error("Unsupported CLI wrapper; configure the actual executable path: " + file);
    }
    return resolveTargets(realTarget, visited);
  }
  throw new Error("Unsupported CLI wrapper; configure the actual executable path: " + file);
}

function inspect(file) {
  try {
    const buffer = fs.readFileSync(file);
    let uncounted = buffer;
    const rules = RULES.map(rule => {
      const cleanMatches = count(uncounted, rule.clean);
      if (cleanMatches) uncounted = replace(uncounted, rule.clean, Buffer.alloc(rule.clean.length));
      return { id: rule.id, rawMatches: count(buffer, rule.raw), cleanMatches };
    });
    const rawMatches = rules.reduce((total, rule) => total + rule.rawMatches, 0);
    const cleanMatches = rules.reduce((total, rule) => total + rule.cleanMatches, 0);
    return { path: file, rawMatches, cleanMatches, rules,
      status: rawMatches ? "unscrubbed" : cleanMatches ? "clean" : "unknown" };
  } catch (error) {
    return { path: file, status: "unknown", error: error.code || error.message };
  }
}

function overall(files) {
  if (!files.length) return "not_found";
  if (files.some(file => file.error || file.status === "unknown")) return "unknown";
  if (files.some(file => file.status === "unscrubbed")) return "unscrubbed";
  return "clean";
}

function run(action, target) {
  const launcher = resolveLauncher(target);
  const targets = resolveTargets(launcher);
  const before = targets.map(inspect);
  if (action === "check") return { status: overall(before), launcher, files: before };
  const errors = [];
  let changedCount = 0;
  for (const entry of before) {
    try {
      if (entry.error || entry.status === "unknown") throw new Error("Installed CLI version has no supported prompt marker");
      const current = fs.readFileSync(entry.path);
      let expected = current;
      let matches = 0;
      for (const rule of RULES) {
        const from = action === "apply" ? rule.raw : rule.clean;
        const to = action === "apply" ? rule.clean : rule.raw;
        const occurrences = count(expected, from);
        matches += occurrences;
        if (occurrences) expected = replace(expected, from, to);
      }
      if (!matches) continue;
      // Restore only the exact marker, never copy an older version's backup.
      if (action === "apply") {
        const backup = entry.path + ".orig.bak";
        if (!fs.existsSync(backup)) fs.writeFileSync(backup, current, { flag: "wx", mode: fs.statSync(entry.path).mode });
      }
      if (!fs.readFileSync(entry.path).equals(current)) throw new Error("CLI changed during patch; retry after its update finishes");
      fs.writeFileSync(entry.path, expected);
      if (!fs.readFileSync(entry.path).equals(expected)) throw new Error("CLI write verification failed");
      changedCount += matches;
    } catch (error) {
      errors.push({ path: entry.path, error: error.code || error.message });
    }
  }
  const files = targets.map(inspect);
  const status = overall(files);
  const success = errors.length === 0 && (action === "apply"
    ? status === "clean"
    : files.every(file => file.status === "unscrubbed" && file.cleanMatches === 0));
  return { success, status, launcher, files, errors,
    ...(action === "apply" ? { patchedCount: changedCount } : { restoredCount: changedCount }),
    message: success ? undefined : errors.map(e => e.path + ": " + e.error).join("; ") || "CLI verification failed",
  };
}

function main(args) {
  const [action = "check", target] = args;
  if (action === "selftest") return { ok: RULES.every(rule => rule.raw.length === rule.clean.length),
    rules: RULES.map(rule => ({ id: rule.id, rawLen: rule.raw.length, cleanLen: rule.clean.length })) };
  if (!["check", "apply", "restore"].includes(action)) throw new Error("Unknown scrub action");
  return run(action, target);
}

module.exports = { RAW, CLEAN, CLEAN_TEXT, RULES, inspect, overall, resolveTargets, run };
if (require.main === module || __filename === "[eval]") {
  try {
    const args = process.argv.slice(__filename === "[eval]" ? 1 : 2);
    const result = main(args);
    process.stdout.write(JSON.stringify(result) + "\n");
    if (result.success === false) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(JSON.stringify({ success: false, status: "unknown", error: error.message }) + "\n");
    process.exitCode = 1;
  }
}
