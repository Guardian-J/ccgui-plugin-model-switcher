import { defineConfig } from "vite";
import { resolve } from "node:path";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

export default defineConfig({
  esbuild: {
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
  },
  plugins: [
    {
      name: "copy-manifest-and-root-main",
      closeBundle() {
        const srcManifest = resolve(__dirname, "manifest.json");
        const destDir = resolve(__dirname, "dist");
        const destManifest = resolve(destDir, "manifest.json");
        if (existsSync(srcManifest)) {
          mkdirSync(destDir, { recursive: true });
          copyFileSync(srcManifest, destManifest);
        }
        for (const name of ["scrub-core.cjs"]) {
          const src = resolve(__dirname, "scripts", name);
          if (existsSync(src)) {
            copyFileSync(src, resolve(destDir, name));
          }
        }
        const distMain = resolve(destDir, "main.js");
        const rootMain = resolve(__dirname, "main.js");
        if (existsSync(distMain)) {
          copyFileSync(distMain, rootMain);
        }
      },
    },
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      formats: ["es"],
      fileName: () => "main.js",
    },
    rollupOptions: {
      // 没有任何外部模块依赖，纯单文件自包含 ESM，浏览器原生 import(blobUrl) 即可直接运行
      external: [],
      output: {
        entryFileNames: "main.js",
        assetFileNames: "styles.[ext]",
      },
    },
    outDir: "dist",
    emptyOutDir: true,
  },
});
