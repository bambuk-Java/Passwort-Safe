import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import { NodeModulesPolyfillPlugin } from "@esbuild-plugins/node-modules-polyfill";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    target: 'esnext',
  }
  ,
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      // Polyfill für Buffer und andere Node.js-Module
      buffer: "buffer",
      process: "process/browser",
    },
  },
  optimizeDeps: {
    include: ["circomlib"],
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true,
        }),
        NodeModulesPolyfillPlugin(),
      ],
    },
  },
});
