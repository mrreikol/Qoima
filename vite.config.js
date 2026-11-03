import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Keep shared controls/icons together instead of one tiny icon chunk.
          includeDependenciesRecursively: false,
          groups: [
            { name: "shared-ui", test: /node_modules[\\/](react[\\/]|lucide-react[\\/])|\0rolldown\/runtime/ },
            { name: "inventory-data", test: /src[\\/](data[\\/](inventory|stockHistory|categoryDeletion)\.js|inventory[\\/]latestHistoryRequest\.js)/ },
            // The Excel writer must not import the Products page just for headers.
            { name: "export-data", test: /src[\\/]data[\\/]inventory(?:ExportData|Csv)\.js/ },
          ],
        },
      },
    },
  },
});
