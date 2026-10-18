/**
 * Get cached health data endpoint
 */

import type { HealthStore } from "../storage/health-store.ts";

export async function handleGetCache(store: HealthStore): Promise<Response> {
  try {
    const cachedData = await store.getCachedHealthData();

    return new Response(JSON.stringify(cachedData), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60", // Short cache - client will manage freshness
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error getting cached health:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to get cached health",
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
