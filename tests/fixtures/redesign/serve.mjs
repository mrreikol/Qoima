import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Explicit opt-in UI fixture. Environment loading is disabled. Never deploy it.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  cacheDir: path.join(root, "node_modules/.vite-redesign-review"),
  server: { host: "127.0.0.1", port: 5318, strictPort: true },
  resolve: {
    alias: [
      {
        find: /.*lib\/supabase(?:\.js)?$/,
        replacement: path.join(root, "tests/fixtures/redesign/client.js"),
      },
    ],
  },
  plugins: [
    {
      name: "isolated-review-entry",
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (
            request.headers.accept?.includes("text/html") &&
            !request.url.includes(".")
          ) {
            const fs = await import("node:fs/promises");
            const html = await server.transformIndexHtml(
              request.url,
              await fs.readFile(
                path.join(root, "tests/fixtures/redesign/index.html"),
                "utf8",
              ),
            );
            response.setHeader("Content-Type", "text/html");
            response.end(html);
            return;
          }
          next();
        });
      },
    },
  ],
});
await server.listen();
console.log(
  "Isolated review: http://localhost:5318/products (no remote writes)",
);
