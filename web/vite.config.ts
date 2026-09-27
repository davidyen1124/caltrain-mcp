import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds one self-contained HTML file that the Python server serves as the
// `ui://caltrain/timetable-*.html` MCP App resource.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: resolve(__dirname, "../src/caltrain_mcp/ui"),
    emptyOutDir: false,
    rollupOptions: { input: resolve(__dirname, "timetable.html") },
  },
});
