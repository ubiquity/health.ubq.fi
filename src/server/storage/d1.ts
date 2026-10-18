import type { HealthStore } from "./health-store.ts";
import type {
  AppHealth,
  AppsListResponse,
  CachedHealthData,
  PluginHealth,
} from "./types.ts";

interface CacheRow {
  entity_type: "app" | "plugin" | "metadata";
  entity_key: string;
  result_json: string;
}

export function createD1HealthStore(database: D1Database): HealthStore {
  return {
    discovery: {
      async getDiscoveryCache() {
        const row = await database.prepare(
          "SELECT data_json FROM health_discovery WHERE id = 1",
        ).first<{ data_json: string }>();
        return row ? JSON.parse(row.data_json) as AppsListResponse : null;
      },
      async acquireDiscoveryRefresh(owner, now, expiresAt) {
        const row = await database.prepare(
          "UPDATE health_discovery_lease SET owner = ?, expires_at = ? WHERE id = 1 AND expires_at <= ? RETURNING owner",
        ).bind(owner, expiresAt, now).first<{ owner: string }>();
        return row?.owner === owner;
      },
      async saveDiscoveryCache(data, owner, now) {
        const row = await database.prepare(
          "INSERT INTO health_discovery (id, data_json) SELECT 1, ? WHERE EXISTS (SELECT 1 FROM health_discovery_lease WHERE id = 1 AND owner = ? AND expires_at > ?) ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json RETURNING id",
        ).bind(JSON.stringify(data), owner, now).first<{ id: number }>();
        return row?.id === 1;
      },
      async releaseDiscoveryRefresh(owner) {
        await database.prepare(
          "UPDATE health_discovery_lease SET owner = NULL, expires_at = 0 WHERE id = 1 AND owner = ?",
        ).bind(owner).run();
      },
    },
    async getCachedHealthData() {
      // The default D1 API reads the primary; do not opt into unconstrained replicas.
      const entries = await database.prepare(
        "SELECT entity_type, entity_key, result_json FROM health_cache UNION ALL SELECT 'metadata', '', last_global_update FROM health_metadata WHERE id = 1",
      ).all<CacheRow>();
      const meta = entries.results.find((row) =>
        row.entity_type === "metadata"
      );
      if (!meta) throw new Error("Health cache schema is not initialized");
      const data: CachedHealthData = {
        apps: {},
        plugins: {},
        lastGlobalUpdate: meta.result_json,
      };
      for (const row of entries.results) {
        if (row.entity_type === "app") {
          data.apps[row.entity_key] = JSON.parse(row.result_json) as AppHealth;
        } else if (row.entity_type === "plugin") {
          data.plugins[row.entity_key] = JSON.parse(
            row.result_json,
          ) as PluginHealth;
        }
      }
      return data;
    },
    async updateHealthData(request) {
      const timestamp = new Date().toISOString();
      try {
        await database.batch([
          database.prepare(
            "INSERT INTO health_cache (entity_type, entity_key, result_json) VALUES (?, ?, ?) ON CONFLICT(entity_type, entity_key) DO UPDATE SET result_json = excluded.result_json",
          )
            .bind(
              request.type === "app" ? "app" : "plugin",
              request.key,
              JSON.stringify(request.result),
            ),
          database.prepare(
            "UPDATE health_metadata SET last_global_update = ? WHERE id = 1",
          ).bind(timestamp),
        ]);
        // Existing consumers use this legacy storage label; the actual backend is D1.
        return { success: true, storage: "deno-kv", timestamp };
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "health_cache_write_failed",
            message: error instanceof Error ? error.message : "Unknown error",
          }),
        );
        return {
          success: false,
          storage: "error",
          timestamp,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  };
}
