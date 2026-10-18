/** Public GitHub organization catalogs retain the router's historical discovery source. */
import type { AppsListResponse } from "../storage/types.ts";
import type { DiscoveryCacheStore } from "../storage/health-store.ts";

const CACHE_DURATION = 5 * 60 * 1000;
const MAX_DISCOVERY_REQUESTS = 12;
const REFRESH_TIMEOUT = 30_000;
const REFRESH_LEASE_DURATION = 45_000;
const GITHUB_ORIGIN = "https://api.github.com";
let cache: { data: AppsListResponse | null; timestamp: number } = {
  data: null,
  timestamp: 0,
};
// Local adapters share admission state, never a request's in-flight I/O promise.
let localRefreshInProgress = false;

export class DiscoveryRefreshInProgressError extends Error {
  constructor() {
    super("Discovery refresh is in progress; retry shortly");
    this.name = "DiscoveryRefreshInProgressError";
  }
}

interface Repository {
  name: string;
  description?: string | null;
}

function isRepository(value: unknown): value is Repository {
  return typeof value === "object" && value !== null && "name" in value &&
    typeof value.name === "string" &&
    (!("description" in value) || value.description === null ||
      typeof value.description === "string");
}

function validSubdomain(value: string): boolean {
  return value === "" ||
    value.split(".").every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)
    );
}

async function fetchRepositories(
  organization: string,
  budget: { remaining: number },
  refreshSignal: AbortSignal,
): Promise<Repository[]> {
  const path = `/orgs/${organization}/repos`;
  let next: string | null = `${GITHUB_ORIGIN}${path}?per_page=100`;
  const visited = new Set<string>();
  const repositories: Repository[] = [];
  while (next) {
    const url: URL = new URL(next);
    if (
      url.origin !== GITHUB_ORIGIN || url.pathname !== path || url.username ||
      url.password || visited.has(url.href)
    ) {
      throw new Error(`Invalid GitHub pagination for ${organization}`);
    }
    if (budget.remaining-- <= 0) {
      throw new Error("GitHub discovery exceeded its 12-request budget");
    }
    visited.add(url.href);
    const response: Response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "uos-health-monitor",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "manual",
      signal: AbortSignal.any([refreshSignal, AbortSignal.timeout(15000)]),
    });
    if (!response.ok) {
      const reset = response.headers.get("x-ratelimit-reset");
      await response.body?.cancel();
      throw new Error(
        `GitHub discovery for ${organization} failed: HTTP ${response.status}${
          reset ? ` (rate limit reset ${reset})` : ""
        }`,
      );
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data) || !data.every(isRepository)) {
      throw new Error(`Invalid GitHub repository list for ${organization}`);
    }
    repositories.push(...data);
    next =
      response.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ??
        null;
  }
  return repositories;
}

export async function getAppsFromRouter(
  persistent?: DiscoveryCacheStore,
): Promise<AppsListResponse> {
  const now = Date.now();
  if (cache.data && now - cache.timestamp < CACHE_DURATION) return cache.data;
  if (persistent) {
    try {
      const saved = await persistent.getDiscoveryCache();
      if (
        saved && (!cache.data || Date.parse(saved.timestamp) > cache.timestamp)
      ) {
        cache = { data: saved, timestamp: Date.parse(saved.timestamp) };
      }
      if (cache.data && now - cache.timestamp < CACHE_DURATION) {
        return cache.data;
      }
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: "discovery_cache_read_failed",
          message: String(error),
        }),
      );
    }
  }
  let admitted = false;
  const owner = persistent ? crypto.randomUUID() : "";
  const refreshStartedAt = Date.now();
  const refreshSignal = AbortSignal.timeout(REFRESH_TIMEOUT);
  try {
    if (persistent) {
      admitted = await persistent.acquireDiscoveryRefresh(
        owner,
        refreshStartedAt,
        refreshStartedAt + REFRESH_LEASE_DURATION,
      );
      if (!admitted) throw new DiscoveryRefreshInProgressError();
      // Another request may have refreshed between the first read and admission.
      const saved = await persistent.getDiscoveryCache();
      if (saved && Date.now() - Date.parse(saved.timestamp) < CACHE_DURATION) {
        cache = { data: saved, timestamp: Date.parse(saved.timestamp) };
        return saved;
      }
    } else {
      if (localRefreshInProgress) throw new DiscoveryRefreshInProgressError();
      localRefreshInProgress = true;
      admitted = true;
    }
    const budget = { remaining: MAX_DISCOVERY_REQUESTS };
    const results = await Promise.allSettled([
      fetchRepositories("ubiquity", budget, refreshSignal),
      fetchRepositories("ubiquity-os-marketplace", budget, refreshSignal),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    const [appResult, pluginResult] = results;
    if (
      appResult.status !== "fulfilled" || pluginResult.status !== "fulfilled"
    ) throw new Error("GitHub discovery did not complete");
    const appRepositories = appResult.value;
    const pluginRepositories = pluginResult.value;
    const apps = new Set<string>();
    for (const repository of appRepositories) {
      const name = repository.name.toLowerCase();
      if (name !== "ubq.fi" && !name.endsWith(".ubq.fi")) continue;
      const subdomain = name === "ubq.fi" ? "" : name.slice(0, -7);
      if (validSubdomain(subdomain)) apps.add(subdomain);
    }
    const plugins: AppsListResponse["plugins"] = [];
    for (const repository of pluginRepositories) {
      const label = `os-${repository.name.toLowerCase()}`;
      if (label.includes(".") || !validSubdomain(label)) continue;
      const routingDomain = `${label}.ubq.fi`;
      plugins.push({
        name: repository.name,
        variants: ["main", "development"],
        url: `https://${routingDomain}/`,
        routingDomain,
        displayName: repository.name,
        description: repository.description || `UBQ Plugin: ${repository.name}`,
      });
    }
    const response: AppsListResponse = {
      apps: Array.from(apps).sort(),
      plugins,
      others: [],
      timestamp: new Date().toISOString(),
    };
    if (apps.size === 0 && plugins.length === 0) {
      throw new Error("GitHub discovery returned no valid app or plugin hosts");
    }
    if (persistent) {
      if (!await persistent.saveDiscoveryCache(response, owner, Date.now())) {
        throw new Error("Discovery refresh lease expired; retry shortly");
      }
    }
    cache = { data: response, timestamp: Date.parse(response.timestamp) };
    console.log(
      JSON.stringify({
        event: "github_discovery",
        apps: response.apps.length,
        plugins: plugins.length,
        requests: MAX_DISCOVERY_REQUESTS - budget.remaining,
      }),
    );
    return response;
  } catch (error) {
    if (
      cache.data &&
      (cache.data.apps.length > 0 || cache.data.plugins.length > 0)
    ) {
      return {
        ...cache.data,
        stale: true,
        error: error instanceof Error ? error.message : "Discovery failed",
      };
    }
    throw error;
  } finally {
    if (admitted && persistent) {
      try {
        await persistent.releaseDiscoveryRefresh(owner);
      } catch (error) {
        console.warn(
          JSON.stringify({
            event: "discovery_refresh_release_failed",
            message: String(error),
          }),
        );
      }
    } else if (admitted) {
      localRefreshInProgress = false;
    }
  }
}

export function clearCache(): void {
  cache = { data: null, timestamp: 0 };
}
