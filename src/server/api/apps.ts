/**
 * Apps list endpoint
 */

import {
  DiscoveryRefreshInProgressError,
  getAppsFromRouter,
} from "../utils/router-api.ts";

import { checkAppHealth } from "../utils/health-checker.ts";
import type { DiscoveryCacheStore } from "../storage/health-store.ts";

export async function handleGetApps(
  discovery?: DiscoveryCacheStore,
): Promise<Response> {
  try {
    const apps = await getAppsFromRouter(discovery);

    return new Response(JSON.stringify(apps), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": apps.stale
          ? "public, max-age=60"
          : "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    const refreshing = error instanceof DiscoveryRefreshInProgressError;
    if (!refreshing) console.error("Error getting apps list:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to get apps list",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: refreshing ? 503 : 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          ...(refreshing ? { "Retry-After": "1" } : {}),
        },
      },
    );
  }
}

export async function handleGetAppHealth(domain: string): Promise<Response> {
  try {
    const health = await checkAppHealth(domain);

    return new Response(JSON.stringify(health), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error(`Error checking health for ${domain}:`, error);
    return new Response(
      JSON.stringify({
        error: "Failed to check app health",
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
