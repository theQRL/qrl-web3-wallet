import commonjs from "@rollup/plugin-commonjs";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import nodePolyfills from "rollup-plugin-node-polyfills";
import { Plugin, defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";
import { version } from "./package.json";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    webExtension({
      manifest: "src/manifest.json",
      additionalInputs: ["src/scripts/inPageScript.ts"],
      disableAutoLaunch: true,
      watchFilePaths: ["src"],
      transformManifest: (manifest) => {
        manifest.version = version;
        // Mark the action popup after Vite resolves the HTML entry point.
        if (manifest.action.default_popup) {
          manifest.action.default_popup += "?actionPopup=1";
        }
        return manifest;
      },
    }),
  ],
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
  build: {
    outDir: "Extension",
    emptyOutDir: true,
    rollupOptions: {
      plugins: [
        commonjs({
          requireReturnsDefault: "auto",
        }),
        nodePolyfills() as Plugin,
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      events: path.resolve(__dirname, "node_modules/rollup-plugin-node-polyfills/polyfills/events.js"),
      buffer: "buffer",
    },
  },
});
