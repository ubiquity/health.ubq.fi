/**
 * Focused regression tests for discovery host normalization and probe targets.
 *
 * Context: the accepted router discovery catalog (ubq.fi-router 06748e4)
 * publishes `https://ubq.fi/` and `https://www.ubq.fi/` in `/sitemap.json`. The
 * dashboard's label model intentionally represents the apex as the empty
 * identifier (`renderCard` appends `.ubq.fi` to every non-empty label and shows
 * the apex for an empty one), and the server accepts an empty `/api/health/`
 * remainder, so the consumer keeps that contract. The checker must resolve the
 * empty label (and whitespace) to a real apex probe instead of building
 * `https://.ubq.fi/...`; named apps and plugins keep `/manifest.json`.
 *
 * Every fetch is stubbed; these tests perform no live network probing.
 */

import { clearCache, getAppsFromRouter } from "./router-api.ts";
import { checkAppHealth, checkPluginManifest } from "./health-checker.ts";

const SITEMAP_URL = "https://ubq.fi/sitemap.json";
const PLUGIN_MAP_URL = "https://ubq.fi/plugin-map.json";

/**
 * These tests exercise the real checker module. Its module-load cleanup timer
 * stays pending for the process lifetime, so disable the op/resource sanitizers
 * rather than reporting that pre-existing interval as a test leak.
 */
const checkerTestOptions = {
  sanitizeOps: false,
  sanitizeResources: false,
} as const;

interface CapturedRequest {
  url: string;
  method: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Stub the global fetch: answers the router discovery endpoints, records every
 * request, and answers all health probes with a manifest-shaped 200.
 */
function stubDiscoveryFetch(): {
  requests: CapturedRequest[];
  restore: () => void;
} {
  const requests: CapturedRequest[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
    const method = init?.method ??
      (input instanceof Request ? input.method : "GET");
    requests.push({ url, method });

    if (url === SITEMAP_URL) {
      return Promise.resolve(jsonResponse({
        version: "1.0",
        generated: "2026-09-22T00:00:00.000Z",
        generator: "ubq.fi-router",
        totalUrls: 3,
        urls: [
          { url: "https://ubq.fi/" },
          { url: "https://www.ubq.fi/" },
          { url: "https://pay.ubq.fi/" },
        ],
      }));
    }

    if (url === PLUGIN_MAP_URL) {
      return Promise.resolve(jsonResponse({
        version: "1.0",
        generated: "2026-09-22T00:00:00.000Z",
        generator: "ubq.fi-router",
        totalPlugins: 1,
        plugins: [{
          pluginName: "os-example",
          url: "https://os-example.ubq.fi/",
          displayName: "OS Example",
          description: "Representative plugin",
          deployments: { main: "https://os-example.ubq.fi/" },
        }],
      }));
    }

    return Promise.resolve(
      jsonResponse({ name: "probe", description: "stubbed manifest" }),
    );
  };

  return {
    requests,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

function probeRequests(requests: CapturedRequest[]): CapturedRequest[] {
  return requests.filter((request) =>
    request.url !== SITEMAP_URL && request.url !== PLUGIN_MAP_URL
  );
}

/** No request may target a host with an empty first label, e.g. `.ubq.fi`. */
function assertNoEmptyHost(requests: CapturedRequest[]): void {
  for (const request of requests) {
    const hostname = new URL(request.url).hostname;
    assert(
      hostname !== "" && !hostname.startsWith("."),
      `request targeted an empty host: ${request.url}`,
    );
  }
}

Deno.test({
  name:
    "sitemap normalization keeps the intentional empty apex label and the www label",
  ...checkerTestOptions,
  fn: async () => {
    const { requests, restore } = stubDiscoveryFetch();
    clearCache();
    try {
      const discovery = await getAppsFromRouter();

      assert(
        discovery.apps.includes(""),
        `intentional empty apex label lost: ${JSON.stringify(discovery.apps)}`,
      );
      assert(
        discovery.apps.includes("www"),
        `www label lost: ${JSON.stringify(discovery.apps)}`,
      );
      assert(
        discovery.apps.includes("pay"),
        `named app lost: ${JSON.stringify(discovery.apps)}`,
      );
      assert(
        !discovery.apps.some((app) => app.startsWith(".")),
        "no app identifier may start with a dot",
      );
      assertEquals(
        discovery.apps,
        ["", "pay", "www"],
        "apps are sorted and complete",
      );
      assertNoEmptyHost(requests);
    } finally {
      restore();
      clearCache();
    }
  },
});

Deno.test({
  name:
    "empty apex label, www, named app and plugin drive exact probe hosts and paths",
  ...checkerTestOptions,
  fn: async () => {
    const { requests, restore } = stubDiscoveryFetch();
    clearCache();
    try {
      const discovery = await getAppsFromRouter();
      // The apex is the intentional empty label from the real normalization.
      const apex = discovery.apps.find((app) => app === "");
      const www = discovery.apps.find((app) => app === "www");
      const namedApp = discovery.apps.find((app) => app === "pay");
      const plugin = discovery.plugins[0];
      assert(apex !== undefined, "discovery must expose the empty apex label");
      assert(www !== undefined, "discovery must expose the www label");
      assert(namedApp !== undefined, "discovery must expose the named app");
      assert(plugin, "discovery must expose the representative plugin");

      // Drive the actual consumer normalization into the actual checker.
      const apexHealth = await checkAppHealth(apex);
      const wwwHealth = await checkAppHealth(www);
      await checkAppHealth(namedApp);
      await checkAppHealth(plugin.routingDomain);
      const pluginManifest = await checkPluginManifest(plugin.routingDomain);

      assertEquals(
        probeRequests(requests),
        [
          { url: "https://ubq.fi/", method: "HEAD" },
          { url: "https://www.ubq.fi/", method: "HEAD" },
          { url: "https://pay.ubq.fi/manifest.json", method: "HEAD" },
          { url: "https://os-example.ubq.fi/manifest.json", method: "HEAD" },
          { url: "https://os-example.ubq.fi/manifest.json", method: "GET" },
        ],
        "exact probe hosts, paths and methods",
      );
      assert(
        apexHealth.healthy && apexHealth.status === 200,
        "apex is healthy",
      );
      assert(wwwHealth.healthy && wwwHealth.status === 200, "www is healthy");
      assert(pluginManifest.manifestValid, "plugin manifest stays valid");
      assert(
        !probeRequests(requests).some((request) =>
          request.url.includes("//.ubq.fi")
        ),
        "no probe may target the invalid empty host .ubq.fi",
      );
      assertNoEmptyHost(requests);
    } finally {
      restore();
      clearCache();
    }
  },
});

Deno.test({
  name:
    "empty and legacy root identifiers resolve to the apex root instead of .ubq.fi",
  ...checkerTestOptions,
  fn: async () => {
    const { requests, restore } = stubDiscoveryFetch();
    try {
      const empty = await checkAppHealth("");
      const root = await checkAppHealth("root");

      assert(
        empty.healthy && empty.status === 200,
        "empty identifier is healthy",
      );
      assert(root.healthy && root.status === 200, "root identifier is healthy");
      assertEquals(
        probeRequests(requests).map((request) => request.url),
        ["https://ubq.fi/", "https://ubq.fi/"],
        "empty and root identifiers probe the apex root",
      );
      assertNoEmptyHost(requests);
    } finally {
      restore();
    }
  },
});
