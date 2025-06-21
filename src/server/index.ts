/// <reference lib="deno.ns" />

/**
 * UBQ.FI Health Monitor - Deno Deploy Entry Point
 * Standalone health monitoring application
 */

import { serveDir, serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { handleGetApps, handleGetAppHealth } from "./api/apps.ts";
import { handleGetCache } from "./api/cache.ts";
import { handleUpdateHealth } from "./api/update.ts";
import { handleProxyStatus, handleProxyManifest } from "./api/proxy.ts";
import { handleLegacyHealthApi } from "./api/legacy.ts";
import { generateDevtoolsJson } from "./utils/generate-devtools-json.ts";

async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    // Health API endpoints
    if (path === "/api/apps") {
      return await handleGetApps();
    } else if (path === "/health/cache") {
      return await handleGetCache();
    } else if (path === "/health/update") {
      return await handleUpdateHealth(request);
    } else if (path === "/health/proxy/status") {
      return await handleProxyStatus(url);
    } else if (path === "/health/proxy/manifest") {
      return await handleProxyManifest(url);
    } else if (path === "/json") {
      // Legacy endpoint for compatibility
      return await handleLegacyHealthApi();
    } else if (path.startsWith("/api/health/")) {
      const domain = path.replace("/api/health/", "");
      return await handleGetAppHealth(domain);
    } else if (path === "/.well-known/appspecific/com.chrome.devtools.json") {
      return serveFile(request, "src/client/.well-known/appspecific/com.chrome.devtools.json");
    }

    return serveDir(request, {
      fsRoot: "src/client/dashboard",
      urlRoot: "",
      showDirListing: false,
      quiet: true,
    });
  } catch (error) {
    console.error("Request handler error:", error);
    return new Response(JSON.stringify({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

// Export the handler as default for Deno Deploy
export default { fetch: serve };

// For local development, Deno.serve is now implicitly called by the task runner
if (import.meta.main) {
  await generateDevtoolsJson();
}
