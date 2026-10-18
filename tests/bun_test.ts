import { test } from "bun:test";
import { deepStrictEqual, equal, match } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../bun.ts";

test("real Bun listener serves assets and persists external cache updates across restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "uos-health-bun-"));
  let server = await startServer({
    port: 0,
    cachePath: join(directory, "health-cache.json"),
  });
  const app = {
    name: "pay",
    domain: "pay.ubq.fi",
    healthy: true,
    status: 200,
    lastChecked: "2026-10-18T00:00:00.000Z",
  };
  try {
    const home = await fetch(server.url);
    equal(home.status, 200);
    match(await home.text(), /Health/);
    const asset = await fetch(new URL("style.css", server.url), {
      method: "HEAD",
    });
    equal(asset.status, 200);
    equal(await asset.text(), "");
    const update = await fetch(new URL("health/update", server.url), {
      method: "POST",
      body: JSON.stringify({ type: "app", key: "pay", result: app }),
    });
    equal(update.status, 200);
    deepStrictEqual(
      (await (await fetch(new URL("health/cache", server.url))).json()).apps
        .pay,
      app,
    );
    await server.stop(true);
    server = await startServer({
      port: 0,
      cachePath: join(directory, "health-cache.json"),
    });
    const legacy = await (await fetch(new URL("json", server.url))).json();
    deepStrictEqual(legacy.apps, [app]);
    equal(legacy.summary.overallHealthPercentage, 100);
    equal((await fetch(new URL("missing", server.url))).status, 404);
  } finally {
    await server.stop(true);
    await rm(directory, { recursive: true });
  }
});
