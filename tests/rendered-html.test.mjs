import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the Spanish visualization shell and metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="es-MX"/i);
  assert.match(html, /<title>Viento y temperatura sobre México<\/title>/i);
  assert.match(html, /40 días de atmósfera, hora por hora/);
  assert.match(html, /ERA5 · 240 nodos · 960 horas/);
  assert.match(html, /Cada pelo mantiene el mismo largo/);
  assert.doesNotMatch(html, /react-loading-skeleton|Your site is taking shape/i);
});

test("ships the complete, compressed 240-node dataset", async () => {
  const manifestUrl = new URL("../public/data/weather-manifest.json", import.meta.url);
  const binaryUrl = new URL(
    "../public/data/weather-2026-07-01_2026-08-09.bin",
    import.meta.url,
  );
  const [manifestText, binaryStat] = await Promise.all([
    readFile(manifestUrl, "utf8"),
    stat(binaryUrl),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.frames, 960);
  assert.equal(manifest.coords.length, 240);
  assert.equal(manifest.start, "2026-07-01T00:00:00Z");
  assert.equal(manifest.end, "2026-08-09T23:00:00Z");
  assert.equal(manifest.codec, "delta-varint-gzip-v1");
  assert.equal(binaryStat.size, manifest.compressedBytes);
});
