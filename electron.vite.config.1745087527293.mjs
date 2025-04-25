// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src")
      }
    },
    plugins: [react()],
    css: {
      postcss: "./postcss.config.js"
    },
    build: {
      rollupOptions: {
        // Include static assets in the build
        input: {
          index: resolve("src/renderer/index.html")
        }
      }
    },
    publicDir: resolve("resources"),
    server: {
      // Enable web browser access
      port: 3e3,
      host: true,
      // Allow access from other devices on the network
      open: true,
      hmr: true,
      cors: true
      // Enable CORS for cross-origin requests
    }
  }
});
export {
  electron_vite_config_default as default
};
