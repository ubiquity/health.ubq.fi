/**
 * Focused regression tests for GitHub discovery normalization and probe targets.
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

const SITEMAP_URL = "https://api.github.com/orgs/ubiquity/repos?per_page=100";
const PLUGIN_MAP_URL =
  "https://api.github.com/orgs/ubiquity-os-marketplace/repos?per_page=100";

/**
 * Keep the original mocked-fetch suite's sanitizer settings; the actual runtime
 * and adapter-owned timer lifecycle are exercised by separate workerd/Bun tests.
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
      return Promise.resolve(jsonResponse([
        { name: "ubq.fi" },
        { name: "www.ubq.fi" },
        { name: "pay.ubq.fi" },
        { name: "not-an-app" },
      ]));
    }

    if (url === PLUGIN_MAP_URL) {
      return Promise.resolve(jsonResponse([
        { name: "example", description: "Representative plugin" },
        {
          name: ".github",
          description: "Organization metadata has no valid probe host",
        },
      ]));
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

Deno.test({
  name:
    "GitHub pagination completes discovery and preserves last-known-good data on an invalid next origin",
  ...checkerTestOptions,
  fn: async () => {
    const originalFetch = globalThis.fetch;
    const originalNow = Date.now;
    const requests: string[] = [];
    let invalidNext = false;
    clearCache();
    globalThis.fetch = (input) => {
      const url = String(input);
      requests.push(url);
      if (url === PLUGIN_MAP_URL) {
        return Promise.resolve(jsonResponse([{ name: "example" }]));
      }
      if (url.includes("page=2")) {
        return Promise.resolve(
          jsonResponse([{ name: "pay.ubq.fi", archived: true }]),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify([{ name: "ubq.fi" }]), {
          headers: {
            "Content-Type": "application/json",
            Link: `<${
              invalidNext
                ? "https://untrusted.invalid/next"
                : SITEMAP_URL + "&page=2"
            }>; rel="next"`,
          },
        }),
      );
    };
    try {
      const first = await getAppsFromRouter();
      assertEquals(
        first.apps,
        ["", "pay"],
        "all pages and historical archived entries remain included",
      );
      assertEquals(
        first.plugins[0].variants,
        ["main", "development"],
        "historical plugin variants remain compatible",
      );
      invalidNext = true;
      Date.now = () => originalNow() + 5 * 60 * 1000 + 1;
      const stale = await getAppsFromRouter();
      assert(stale.stale, "upstream pagination failure must be visible");
      assert(
        stale.error?.includes("Invalid GitHub pagination"),
        "pagination failure must explain the rejected source",
      );
      assertEquals(
        stale.apps,
        first.apps,
        "failure must preserve the last-known-good catalog",
      );
      assert(
        requests.every((url) => url.startsWith("https://api.github.com/")),
        "pagination cannot redirect probes to an arbitrary origin",
      );
    } finally {
      globalThis.fetch = originalFetch;
      Date.now = originalNow;
      clearCache();
    }
  },
});

Deno.test({
  name:
    "GitHub discovery fails explicitly when pagination exceeds the free-tier request budget",
  ...checkerTestOptions,
  fn: async () => {
    const originalFetch = globalThis.fetch;
    let requests = 0;
    clearCache();
    globalThis.fetch = (input) => {
      requests++;
      const url = new URL(String(input));
      const page = Number(url.searchParams.get("page") || 1);
      url.searchParams.set("page", String(page + 1));
      return Promise.resolve(
        new Response(JSON.stringify([{ name: "ubq.fi" }]), {
          headers: {
            "Content-Type": "application/json",
            Link: `<${url.href}>; rel="next"`,
          },
        }),
      );
    };
    try {
      let failure = "";
      try {
        await getAppsFromRouter();
      } catch (error) {
        failure = String(error);
      }
      assert(
        failure.includes("12-request budget"),
        "oversized discovery must fail instead of silently truncating",
      );
      assertEquals(
        requests,
        12,
        "external fetch budget is shared by both organizations",
      );
    } finally {
      globalThis.fetch = originalFetch;
      clearCache();
    }
  },
});

Deno.test({
  name:
    "local discovery admits one crawl and exposes concurrent cold or stale states without sharing I/O promises",
  ...checkerTestOptions,
  fn: async () => {
    const { requests, restore } = stubDiscoveryFetch();
    const stubbedFetch = globalThis.fetch;
    const originalNow = Date.now;
    clearCache();
    globalThis.fetch = async (input, init) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return stubbedFetch(input, init);
    };
    try {
      const cold = await Promise.allSettled(
        Array.from({ length: 8 }, () => getAppsFromRouter()),
      );
      assertEquals(
        cold.filter((result) => result.status === "fulfilled").length,
        1,
        "one cold caller owns the local refresh",
      );
      assert(
        cold.filter((result) => result.status === "rejected").every((result) =>
          String(result.reason).includes("refresh is in progress")
        ),
        "other cold callers must receive an explicit retry state",
      );
      assertEquals(
        requests.length,
        2,
        "cold concurrency performs one organization crawl",
      );
      Date.now = () => originalNow() + 5 * 60 * 1000 + 1;
      const warm = await Promise.all(
        Array.from({ length: 8 }, () => getAppsFromRouter()),
      );
      assertEquals(
        warm.filter((result) => result.stale).length,
        7,
        "other warm callers reuse last-known-good data during refresh",
      );
      assert(
        warm.every((result) => result.apps.includes("pay")),
        "refresh admission cannot erase useful cached data",
      );
      assertEquals(
        requests.length,
        4,
        "expiry concurrency still performs only one new organization crawl",
      );
    } finally {
      globalThis.fetch = stubbedFetch;
      restore();
      Date.now = originalNow;
      clearCache();
    }
  },
});
