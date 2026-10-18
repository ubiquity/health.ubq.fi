import type { HealthStore } from "./health-store.ts";
import type { CachedHealthData } from "./types.ts";

export async function createBunHealthStore(path: string): Promise<HealthStore> {
  let cache: CachedHealthData = {
    apps: {},
    plugins: {},
    lastGlobalUpdate: new Date().toISOString(),
  };
  try {
    cache = await Bun.file(path).json() as CachedHealthData;
  } catch {
    // A missing/invalid local cache starts empty, matching the retained VPS adapter.
  }
  let pendingSave = Promise.resolve();
  return {
    getCachedHealthData() {
      return Promise.resolve(structuredClone(cache));
    },
    async updateHealthData(request) {
      if (request.type === "app") cache.apps[request.key] = request.result;
      else cache.plugins[request.key] = request.result;
      const timestamp = new Date().toISOString();
      cache.lastGlobalUpdate = timestamp;
      const snapshot = JSON.stringify(cache, null, 2);
      pendingSave = pendingSave.then(async () => {
        try {
          await Bun.write(path, snapshot);
        } catch (error) {
          console.warn("Failed to save local health cache:", error);
        }
      });
      await pendingSave;
      return { success: true, storage: "deno-kv", timestamp };
    },
  };
}
