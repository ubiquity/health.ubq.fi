import { deepStrictEqual, equal, match, ok } from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

type HarnessWorker = {
  fetch(input: string, init?: RequestInit): Promise<Response>;
};
type HarnessDatabase = { exec(sql: string): Promise<unknown> };
type HarnessRuntime = {
  getWorker(name: string): Promise<HarnessWorker>;
  getD1Database(binding: string, worker: string): Promise<HarnessDatabase>;
  dispose(): Promise<void>;
};
type MiniflareModule = {
  Miniflare: new (options: Record<string, unknown>) => HarnessRuntime;
  convertV4MiniflareOptions(
    options: Record<string, unknown>,
  ): Record<string, unknown>;
};
const loaded: unknown = createRequire(resolve("package.json"))("miniflare");
function isMiniflareModule(value: unknown): value is MiniflareModule {
  return Boolean(
    value && typeof value === "object" && "Miniflare" in value &&
      typeof value.Miniflare === "function" &&
      "convertV4MiniflareOptions" in value &&
      typeof value.convertV4MiniflareOptions === "function",
  );
}
if (!isMiniflareModule(loaded)) {
  throw new Error("miniflare_control_plane_missing");
}
const { Miniflare, convertV4MiniflareOptions } = loaded;
const script = await readFile(process.argv[2], "utf8");
const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const fixtureScript = `
const requests = [];
let discoveryFailure = DISCOVERY_FAILURE;
export default { async fetch(request) {
 const url = new URL(request.url);
 if (url.pathname === '/__fixture_stats') return Response.json(requests);
 if (url.pathname === '/__fixture_recover') { discoveryFailure = false; return new Response(null, {status:204}); }
 requests.push({url: url.href, method: request.method});
 if (url.hostname === 'api.github.com') {
  await new Promise(resolve => setTimeout(resolve, 150));
  if (discoveryFailure) return new Response(null, {status:503});
 }
 if (url.pathname === '/orgs/ubiquity/repos') return Response.json([{name:'ubq.fi'},{name:'www.ubq.fi'},{name:'pay.ubq.fi'}]);
 if (url.pathname === '/orgs/ubiquity-os-marketplace/repos') return Response.json([{name:'example',description:'Example plugin'},{name:'.github'}]);
 if (url.hostname === 'offline.ubq.fi') throw new Error('isolated connection failed');
 if (url.hostname === 'missing.ubq.fi') return new Response(null, {status:404});
 if (request.method === 'HEAD') return new Response(null, {status:200});
 return Response.json({name:'Example',description:'Example plugin'});
}};
`;
function options(discoveryFailure = false) {
  return {
    ...convertV4MiniflareOptions({
      workers: [
        ...["health", "health-peer"].map((name) => ({
          name,
          modules: true,
          script,
          compatibilityDate: config.compatibility_date,
          compatibilityFlags: config.compatibility_flags,
          bindings: {
            UOS_VERSION: {
              id: "offline-health-version",
              tag: "offline",
              timestamp: "2026-10-18T00:00:00.000Z",
            },
          },
          d1Databases: { UOS_HEALTH_CACHE: "offline-health-cache" },
          outboundService: "fixture",
          assets: {
            directory: resolve(config.assets.directory),
            binding: "ASSETS",
            run_worker_first: true,
          },
        })),
        {
          name: "fixture",
          modules: true,
          script: fixtureScript.replace(
            "DISCOVERY_FAILURE",
            String(discoveryFailure),
          ),
          compatibilityDate: config.compatibility_date,
        },
      ],
    }),
    resourcePersistencePath: process.argv[3],
  };
}
let runtime = new Miniflare(options());
try {
  let worker = await runtime.getWorker("health");
  let database = await runtime.getD1Database("UOS_HEALTH_CACHE", "health");
  const migration = await readFile("migrations/0001_health_cache.sql", "utf8");
  await database.exec(
    migration.split(";").map((statement) =>
      statement.trim().replace(/\n/g, " ")
    ).filter(Boolean).join(";\n") + ";",
  );
  const request = (path: string, init?: RequestInit) =>
    worker.fetch(`https://health.invalid${path}`, init);
  const json = async (path: string) => (await request(path)).json();
  const empty = await json("/health/cache");
  deepStrictEqual(empty.apps, {});
  deepStrictEqual(empty.plugins, {});
  ok(!Number.isNaN(Date.parse(empty.lastGlobalUpdate)));
  const home = await request("/");
  equal(home.status, 200);
  equal(home.headers.get("x-uos-runtime"), "cloudflare-workers");
  equal(home.headers.get("x-uos-deployment-id"), "offline-health-version");
  match(await home.text(), /Health/);
  equal((await request("/style.css", { method: "HEAD" })).status, 200);
  equal((await request("/missing-file")).status, 404);
  const preflight = await request("/health/update", { method: "OPTIONS" });
  equal(preflight.status, 200);
  equal(preflight.headers.get("access-control-allow-origin"), "*");
  const peer = await runtime.getWorker("health-peer");
  const concurrent = await Promise.all(
    Array.from(
      { length: 8 },
      (_, index) =>
        (index % 2 ? peer : worker).fetch("https://health.invalid/api/apps"),
    ),
  );
  ok(
    concurrent.some((response) => response.status === 503),
    "cold concurrent callers receive an explicit retry response",
  );
  for (const response of concurrent) {
    ok(response.status === 200 || response.status === 503);
    if (response.status === 503) {
      equal(response.headers.get("retry-after"), "1");
    }
    await response.arrayBuffer();
  }
  const discovery = await json("/api/apps");
  deepStrictEqual(discovery.apps, ["", "pay", "www"]);
  equal(discovery.plugins[0].routingDomain, "os-example.ubq.fi");
  await json("/api/apps");
  equal((await json("/api/health/")).healthy, true);
  equal((await json("/api/health/www")).healthy, true);
  equal(
    (await json("/health/proxy/status?domain=missing.ubq.fi")).deploymentStatus,
    "not-deployed",
  );
  equal((await request("/health/proxy/manifest")).status, 400);
  equal(
    (await json("/health/proxy/manifest?domain=os-example.ubq.fi"))
      .manifestValid,
    true,
  );
  const fixture = await runtime.getWorker("fixture");
  const probes =
    await (await fixture.fetch("https://fixture.invalid/__fixture_stats"))
      .json();
  equal(
    probes.filter((probe: { url: string }) =>
      new URL(probe.url).pathname === "/orgs/ubiquity/repos"
    ).length,
    1,
    "one D1-admitted crawl serves concurrent requests across two workerd isolates",
  );
  equal(
    probes.filter((probe: { url: string }) =>
      new URL(probe.url).pathname === "/orgs/ubiquity-os-marketplace/repos"
    ).length,
    1,
  );
  ok(
    probes.some((probe: { url: string; method: string }) =>
      probe.url === "https://ubq.fi/" && probe.method === "HEAD"
    ),
  );
  const app = {
    name: "pay",
    domain: "pay.ubq.fi",
    healthy: true,
    status: 200,
    lastChecked: "2026-10-18T00:00:00.000Z",
  };
  const plugin = {
    name: "os-example",
    variant: "main",
    domain: "os-example.ubq.fi",
    healthy: false,
    status: 404,
    error: "Not deployed",
    lastChecked: app.lastChecked,
  };
  const update = async (type: string, key: string, result: unknown) => {
    const response = await request("/health/update", {
      method: "POST",
      body: JSON.stringify({ type, key, result }),
    });
    equal(response.status, 200);
    const body = await response.json();
    equal(body.success, true);
    equal(body.storage, "deno-kv");
    return body;
  };
  await Promise.all([
    update("app", "pay", app),
    update("plugin", "os-example:main", plugin),
  ]);
  const cached = await json("/health/cache");
  deepStrictEqual(cached.apps.pay, app);
  deepStrictEqual(cached.plugins["os-example:main"], plugin);
  const legacy = await json("/json");
  deepStrictEqual(legacy.summary, {
    totalApps: 1,
    healthyApps: 1,
    totalPlugins: 1,
    healthyPlugins: 0,
    overallHealthPercentage: 50,
  });
  equal((await request("/health/update")).status, 405);
  equal(
    (await request("/health/update", { method: "POST", body: "invalid-json" }))
      .status,
    500,
  );
  await database.exec(
    "UPDATE health_discovery SET data_json = json_set(data_json, '$.timestamp', '2020-01-01T00:00:00.000Z')",
  );
  await runtime.dispose();
  runtime = new Miniflare(options(true));
  worker = await runtime.getWorker("health");
  deepStrictEqual(
    (await json("/health/cache")).apps.pay,
    app,
    "D1 cache survives runtime restart",
  );
  const staleDiscovery = await json("/api/apps");
  equal(staleDiscovery.stale, true);
  match(staleDiscovery.error, /HTTP 503/);
  deepStrictEqual(
    staleDiscovery.apps,
    ["", "pay", "www"],
    "upstream failure preserves durable last-known-good catalog",
  );
  database = await runtime.getD1Database("UOS_HEALTH_CACHE", "health");
  const failingFixture = await runtime.getWorker("fixture");
  await failingFixture.fetch("https://fixture.invalid/__fixture_recover");
  const recoveredDiscovery = await json("/api/apps");
  equal(
    recoveredDiscovery.stale,
    undefined,
    "a failed crawl releases its lease for a subsequent successful refresh",
  );
  deepStrictEqual(recoveredDiscovery.apps, ["", "pay", "www"]);
  await database.exec(
    "UPDATE health_discovery SET data_json = json_set(data_json, '$.timestamp', '2020-01-01T00:00:00.000Z')",
  );
  await database.exec(
    `UPDATE health_discovery_lease SET owner = 'abandoned-fixture-owner', expires_at = ${
      Date.now() + 60_000
    } WHERE id = 1`,
  );
  await runtime.dispose();
  runtime = new Miniflare(options());
  worker = await runtime.getWorker("health");
  database = await runtime.getD1Database("UOS_HEALTH_CACHE", "health");
  const leasedDiscovery = await json("/api/apps");
  equal(leasedDiscovery.stale, true);
  match(leasedDiscovery.error, /refresh is in progress/);
  const leaseFixture = await runtime.getWorker("fixture");
  deepStrictEqual(
    await (await leaseFixture.fetch("https://fixture.invalid/__fixture_stats"))
      .json(),
    [],
    "an active lease reuses last-known-good data without upstream I/O",
  );
  await database.exec(
    "UPDATE health_discovery_lease SET expires_at = 0 WHERE id = 1",
  );
  const expiredRecovery = await json("/api/apps");
  equal(
    expiredRecovery.stale,
    undefined,
    "an expired lease cannot permanently block refresh",
  );
  const leaseProbes =
    await (await leaseFixture.fetch("https://fixture.invalid/__fixture_stats"))
      .json();
  equal(
    leaseProbes.filter((probe: { url: string }) =>
      new URL(probe.url).hostname === "api.github.com"
    ).length,
    2,
    "expiry admits exactly one new organization crawl",
  );
  await database.exec("DROP TABLE health_cache");
  const failedWrite = await request("/health/update", {
    method: "POST",
    body: JSON.stringify({ type: "app", key: "pay", result: app }),
  });
  equal(failedWrite.status, 202);
  equal((await failedWrite.json()).reason, "storage_error");
  equal((await request("/health/cache")).status, 500);
  await database.exec("DELETE FROM health_discovery");
  await runtime.dispose();
  runtime = new Miniflare(options(true));
  worker = await runtime.getWorker("health");
  equal(
    (await request("/api/apps")).status,
    500,
    "a cold discovery failure cannot become empty success",
  );
  console.log(JSON.stringify({
    runtime: "actual-workerd",
    assertions:
      "assets, discovery, exact probes, CORS, cache isolation, concurrent updates, legacy summary, restart persistence, storage errors, cross-isolate refresh admission, cold retry, failure release, expired lease recovery",
    scheduler: "none",
    network: "isolated-workerd-fixture",
  }));
} finally {
  await runtime.dispose();
}
