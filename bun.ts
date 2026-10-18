import { extname, resolve, sep } from "node:path";
import { handleRequest } from "./src/server/handler.ts";
import { createBunHealthStore } from "./src/server/storage/bun.ts";

const assetsDirectory = resolve(import.meta.dir, "src/client/dashboard");
const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".js": "text/javascript; charset=UTF-8",
  ".png": "image/png",
};

async function serveAssets(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const pathname = decodeURIComponent(new URL(request.url).pathname);
  const path = resolve(
    assetsDirectory,
    `.${pathname === "/" ? "/index.html" : pathname}`,
  );
  if (!path.startsWith(assetsDirectory + sep)) {
    return new Response("Not found", { status: 404 });
  }
  const file = Bun.file(path);
  if (!await file.exists()) return new Response("Not found", { status: 404 });
  return new Response(request.method === "HEAD" ? null : file, {
    headers: {
      "Content-Type": contentTypes[extname(path)] || "application/octet-stream",
      "Content-Length": String(file.size),
    },
  });
}

export async function startServer(
  options: { port?: number; cachePath?: string } = {},
) {
  const store = await createBunHealthStore(
    options.cachePath ?? "health-cache.json",
  );
  return Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 8000,
    fetch: (request) => handleRequest(request, { store, serveAssets }),
  });
}

if (import.meta.main) {
  const server = await startServer();
  console.log(`Health monitor listening on ${server.url}`);
  const stop = () => {
    void server.stop(true);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
