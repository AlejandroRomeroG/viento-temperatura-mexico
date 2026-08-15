import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const engineUrl = new URL("../lib/wind/engine.ts", import.meta.url);

test("keeps reduced motion opt-in compatible with manual playback", async () => {
  const source = await readFile(engineUrl, "utf8");

  assert.match(source, /this\.playing = !this\.reduceMotion\.matches;/);
  assert.match(source, /setPlaying\(next: boolean\)[\s\S]*?this\.playing = next;/);
  assert.doesNotMatch(source, /this\.playing = next &&/);
});

test("uses the closer framing reserved for narrow mobile stages", async () => {
  const source = await readFile(engineUrl, "utf8");

  assert.match(source, /const MOBILE_STAGE_MAX_WIDTH = 560;/);
  assert.match(source, /const MOBILE_HORIZONTAL_PADDING = 18;/);
  assert.match(source, /width < MOBILE_STAGE_MAX_WIDTH/);
});
