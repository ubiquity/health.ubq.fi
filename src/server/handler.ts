import { handleGetAppHealth, handleGetApps } from "./api/apps.ts";
import { handleGetCache } from "./api/cache.ts";
import { handleLegacyHealthApi } from "./api/legacy.ts";
import { handleProxyManifest, handleProxyStatus } from "./api/proxy.ts";
import { handleUpdateHealth } from "./api/update.ts";
import type { HealthStore } from "./storage/health-store.ts";

export interface HealthServices {
  store: HealthStore;
  serveAssets(request: Request): Promise<Response>;
}

export async function handleRequest(
  request: Request,
  services: HealthServices,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
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
    if (path === "/api/apps") {
      return await handleGetApps(services.store.discovery);
    }
    if (path === "/health/cache") return await handleGetCache(services.store);
    if (path === "/health/update") {
      return await handleUpdateHealth(request, services.store);
    }
    if (path === "/health/proxy/status") return await handleProxyStatus(url);
    if (path === "/health/proxy/manifest") {
      return await handleProxyManifest(url);
    }
    if (path === "/json") return await handleLegacyHealthApi(services.store);
    if (path.startsWith("/api/health/")) {
      return await handleGetAppHealth(path.replace("/api/health/", ""));
    }
    return await services.serveAssets(request);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "request_error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
}
