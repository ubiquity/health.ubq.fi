import { test } from "bun:test";
import { equal, ok } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test(
  "actual workerd preserves health APIs, discovery, D1 cache and persistence",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "uos-health-workerd-"));
    try {
      const build = await Bun.build({
        entrypoints: ["worker.ts"],
        outdir: directory,
        target: "browser",
        format: "esm",
        naming: "worker.mjs",
      });
      ok(build.success, build.logs.map(String).join("\n"));
      const script = await Bun.file(join(directory, "worker.mjs")).text();
      ok(
        !/\bDeno\.|from ["'](?:bun:|node:)/.test(script),
        "runtime-only modules must stay outside the Worker graph",
      );
      const harness = await Bun.build({
        entrypoints: ["tests/worker_harness.ts"],
        outdir: directory,
        target: "node",
        format: "esm",
        naming: "harness.mjs",
      });
      ok(harness.success, harness.logs.map(String).join("\n"));
      const child = Bun.spawn([
        "node",
        join(directory, "harness.mjs"),
        join(directory, "worker.mjs"),
        join(directory, "state"),
      ], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      if (stdout) console.log(stdout.trim());
      if (stderr) console.error(stderr.trim());
      equal(code, 0, stderr);
    } finally {
      await rm(directory, { recursive: true });
    }
  },
  60_000,
);
