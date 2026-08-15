import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const repositoryPath = "/viento-temperatura-mexico/";

test("builds a complete static GitHub Pages site under the repository path", async () => {
  const htmlUrl = new URL("../dist-pages/index.html", import.meta.url);
  const html = await readFile(htmlUrl, "utf8");

  assert.match(html, /<html[^>]*lang="es-MX"/i);
  assert.match(html, /<title>Viento y temperatura sobre México<\/title>/i);
  assert.match(html, new RegExp(`${repositoryPath}assets/[^"']+\\.js`));
  assert.match(
    html,
    /https:\/\/alejandroromerog\.github\.io\/viento-temperatura-mexico\//,
  );
  assert.doesNotMatch(html, /openai\.site/i);
});

test("copies every runtime data asset into the Pages artifact", async () => {
  const manifestUrl = new URL(
    "../dist-pages/data/weather-manifest.json",
    import.meta.url,
  );
  const geometryUrl = new URL("../dist-pages/data/mexico.geojson", import.meta.url);
  const binaryUrl = new URL(
    "../dist-pages/data/weather-2026-07-01_2026-08-09.bin",
    import.meta.url,
  );

  const [manifestText, geometryStat, binaryStat] = await Promise.all([
    readFile(manifestUrl, "utf8"),
    stat(geometryUrl),
    stat(binaryUrl),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.coords.length, 240);
  assert.equal(manifest.frames, 960);
  assert.equal(manifest.start, "2026-07-01T00:00:00Z");
  assert.equal(manifest.end, "2026-08-09T23:00:00Z");
  assert.equal(
    manifest.asset,
    "data/weather-2026-07-01_2026-08-09.bin",
  );
  assert.equal(binaryStat.size, manifest.compressedBytes);
  assert.ok(geometryStat.size > 10_000);
});

test("keeps deployment and authorship metadata repository-owned", async () => {
  const [workflow, readme, packageText] = await Promise.all([
    readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);

  assert.match(workflow, /actions\/configure-pages@v6/);
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
  assert.match(workflow, /include-hidden-files: true/);
  assert.match(readme, /Alejandro Romero González/);
  assert.doesNotMatch(`${workflow}\n${readme}\n${packageText}`, /openai\.site/i);
  assert.equal(packageJson.author, "Alejandro Romero González");
});
