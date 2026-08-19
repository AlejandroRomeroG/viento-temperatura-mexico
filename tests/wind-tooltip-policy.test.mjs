import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const experienceUrl = new URL("../components/WindExperience.tsx", import.meta.url);

test("refreshes an active tooltip as the weather snapshot advances", async () => {
  const source = await readFile(experienceUrl, "utf8");

  assert.match(source, /const tooltipPointerRef = useRef<TooltipPointer \| null>\(null\);/);
  assert.match(
    source,
    /onSnapshot\(snapshot\)[\s\S]*?tooltipPointerRef\.current[\s\S]*?tooltipAtPointer\(engine, canvas, pointer\)[\s\S]*?setTooltip\(nextTooltip\);/,
  );
  const seekSource = source.match(
    /function seek\(value: string\) \{([\s\S]*?)\n  \}\n\n  function inspect/,
  )?.[1];
  assert.ok(seekSource);
  assert.doesNotMatch(seekSource, /setTooltip\(null\)/);
});

test("keeps touch inspection anchored and clears cancelled pointers", async () => {
  const source = await readFile(experienceUrl, "utf8");

  assert.match(source, /clientX: event\.clientX,[\s\S]*?clientY: event\.clientY/);
  assert.match(source, /event\.pointerType === "touch" && event\.type === "pointerleave"/);
  assert.match(source, /onPointerLeave=\{clearTooltip\}/);
  assert.match(source, /onPointerCancel=\{clearTooltip\}/);
});
