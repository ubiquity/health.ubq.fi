/// <reference lib="deno.ns" />

import { serveDir, serveFile } from "@std/http/file-server";
import { handleRequest } from "./handler.ts";
import * as store from "./storage/kv.ts";
import { generateDevtoolsJson } from "./utils/generate-devtools-json.ts";
import { startRateLimiterCleanup } from "./utils/health-checker.ts";

// The existing VPS keeps its file cache and local timer outside the Worker graph.
startRateLimiterCleanup();

export default {
  fetch(request: Request): Promise<Response> {
    return handleRequest(request, {
      store,
      serveAssets(request) {
        if (
          new URL(request.url).pathname ===
            "/.well-known/appspecific/com.chrome.devtools.json"
        ) {
          return serveFile(
            request,
            "src/client/.well-known/appspecific/com.chrome.devtools.json",
          );
        }
        return serveDir(request, {
          fsRoot: "src/client/dashboard",
          urlRoot: "",
          showDirListing: false,
          quiet: true,
        });
      },
    });
  },
};

if (import.meta.main && !Deno.env.get("DENO_DEPLOYMENT_ID")) {
  await generateDevtoolsJson();
}
