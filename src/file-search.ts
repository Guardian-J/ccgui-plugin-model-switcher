import fuzzysort from "fuzzysort";
import { gunzipSync, strFromU8 } from "fflate";
import source from "../scripts/file-index.cjs?raw";
import type { PluginContext } from "./ccgui-plugin";

export interface FileIndex { root: string; files: string[]; unreadable: number; truncated: boolean }
export interface FileMatch { path: string; indexes: readonly number[] }

export async function loadFileIndex(ctx: PluginContext, root: string, includeGenerated: boolean): Promise<FileIndex> {
  const result = await ctx.bridge.invoke("plugin_exec_run", {
    bin: "node", args: ["-e", source, "--", root, includeGenerated ? "all" : "project"], timeoutMs: 20000,
  }) as { code: number; stdout: string; stderr: string };
  if (result.code !== 0) throw new Error(result.stderr?.trim() || "无法读取工作区文件");
  const payload = result.stdout.startsWith('gzip:')
    ? strFromU8(gunzipSync(Uint8Array.from(atob(result.stdout.slice(5)), char => char.charCodeAt(0))))
    : result.stdout;
  const value = JSON.parse(payload) as FileIndex;
  if (!value || typeof value.root !== "string" || !Array.isArray(value.files) ||
      !value.files.every(file => typeof file === "string" && safeRelativePath(file))) throw new Error("文件索引返回格式异常");
  return value;
}

export function safeRelativePath(path: string): boolean {
  return !!path && !/^[\\/]|^[a-z]:|\0/i.test(path) && !path.split(/[\\/]/).some(part => part === '..' || part === '.');
}

export function searchFiles(files: string[], query: string): FileMatch[] {
  const text = query.trim().replace(/\\/g, "/");
  if (!text) return files.slice(0, 100).map(path => ({ path, indexes: [] }));
  return fuzzysort.go(text, files, { limit: 100, threshold: 0.1 }).map(hit => ({ path: hit.target, indexes: hit.indexes }));
}

export function absoluteFilePath(root: string, relative: string): string {
  if (!safeRelativePath(relative)) throw new Error("无效的文件路径");
  const separator = root.includes("\\") ? "\\" : "/";
  return root.replace(/[\\/]+$/, "") + separator + relative.replace(/\//g, separator);
}
