import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { gzipSync } from "node:zlib";

const NODE_COUNT = 240;
const BATCH_SIZE = 40;
const TEMP_SCALE = 10;
const WIND_SCALE = 20;
const startDate = process.env.ERA5_START_DATE ?? "2026-07-01";
const requestedEndDate = process.env.ERA5_END_DATE ?? new Date().toISOString().slice(0, 10);
const geometryUrl = new URL("../public/data/mexico.geojson", import.meta.url);
const outputDirectory = new URL("../public/data/", import.meta.url);

const mexico = JSON.parse(await fs.readFile(geometryUrl, "utf8"));
const polygons =
  mexico.geometry.type === "MultiPolygon"
    ? mexico.geometry.coordinates
    : [mexico.geometry.coordinates];

function pointInRing([x, y], ring) {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index, index += 1
  ) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    const crosses =
      (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  if (!pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

function pointInMexico(point) {
  return polygons.some((polygon) => pointInPolygon(point, polygon));
}

const allPoints = polygons.flat(2);
const minLon = Math.floor(Math.min(...allPoints.map(([lon]) => lon)) * 4);
const maxLon = Math.ceil(Math.max(...allPoints.map(([lon]) => lon)) * 4);
const minLat = Math.floor(Math.min(...allPoints.map(([, lat]) => lat)) * 4);
const maxLat = Math.ceil(Math.max(...allPoints.map(([, lat]) => lat)) * 4);
const candidates = [];

for (let latQuarter = minLat; latQuarter <= maxLat; latQuarter += 1) {
  for (let lonQuarter = minLon; lonQuarter <= maxLon; lonQuarter += 1) {
    const point = [lonQuarter / 4, latQuarter / 4];
    if (pointInMexico(point)) candidates.push(point);
  }
}

if (candidates.length < NODE_COUNT) {
  throw new Error(`México contiene solo ${candidates.length} celdas ERA5 candidatas.`);
}

function selectSpaceFilling(points, count) {
  const latitudeReference = (23 * Math.PI) / 180;
  const projected = points.map(([lon, lat]) => [lon * Math.cos(latitudeReference), lat]);
  const selected = [];
  const chosen = new Uint8Array(points.length);
  const nearestDistance = new Float64Array(points.length);
  nearestDistance.fill(Infinity);

  let nextIndex = points.reduce(
    (best, point, index) => {
      const dx = projected[index][0] - -102 * Math.cos(latitudeReference);
      const dy = point[1] - 23;
      const distance = dx * dx + dy * dy;
      return distance < best.distance ? { index, distance } : best;
    },
    { index: 0, distance: Infinity },
  ).index;

  while (selected.length < count) {
    selected.push(points[nextIndex]);
    chosen[nextIndex] = 1;
    const [selectedX, selectedY] = projected[nextIndex];
    let farthestIndex = -1;
    let farthestDistance = -1;

    for (let index = 0; index < points.length; index += 1) {
      if (chosen[index]) continue;
      const dx = projected[index][0] - selectedX;
      const dy = projected[index][1] - selectedY;
      nearestDistance[index] = Math.min(
        nearestDistance[index],
        dx * dx + dy * dy,
      );
      if (nearestDistance[index] > farthestDistance) {
        farthestDistance = nearestDistance[index];
        farthestIndex = index;
      }
    }
    nextIndex = farthestIndex;
  }

  return selected.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

const coords = selectSpaceFilling(candidates, NODE_COUNT);

async function fetchBatch(batch, batchIndex) {
  const params = new URLSearchParams({
    latitude: batch.map(([, lat]) => lat).join(","),
    longitude: batch.map(([lon]) => lon).join(","),
    elevation: batch.map(() => "nan").join(","),
    start_date: startDate,
    end_date: requestedEndDate,
    hourly: "temperature_2m,wind_speed_10m,wind_direction_10m",
    models: "era5",
    wind_speed_unit: "ms",
    timezone: "GMT",
    cell_selection: "nearest",
  });
  const endpoint = `https://archive-api.open-meteo.com/v1/archive?${params}`;
  const response = await fetch(endpoint, {
    headers: { accept: "application/json", "user-agent": "viento-temperatura-mexico/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Open-Meteo lote ${batchIndex} respondió HTTP ${response.status}.`);
  }
  const result = await response.json();
  if (!Array.isArray(result) || result.length !== batch.length) {
    throw new Error(`El lote ${batchIndex} no devolvió ${batch.length} ubicaciones.`);
  }
  return result;
}

const locations = [];
for (let index = 0; index < coords.length; index += BATCH_SIZE) {
  locations.push(...(await fetchBatch(coords.slice(index, index + BATCH_SIZE), index / BATCH_SIZE)));
}

const referenceTimes = locations[0].hourly?.time;
if (!Array.isArray(referenceTimes) || referenceTimes.length === 0) {
  throw new Error("La respuesta no contiene un eje horario.");
}

for (const [index, location] of locations.entries()) {
  if (location.hourly?.time?.length !== referenceTimes.length) {
    throw new Error(`El nodo ${index} tiene un eje temporal incompatible.`);
  }
  for (let frame = 0; frame < referenceTimes.length; frame += 1) {
    if (location.hourly.time[frame] !== referenceTimes[frame]) {
      throw new Error(`El nodo ${index} diverge en la hora ${frame}.`);
    }
  }
}

let commonPrefix = 0;
for (let frame = 0; frame < referenceTimes.length; frame += 1) {
  const complete = locations.every(({ hourly }) =>
    [
      hourly.temperature_2m[frame],
      hourly.wind_speed_10m[frame],
      hourly.wind_direction_10m[frame],
    ].every(Number.isFinite),
  );
  if (!complete) break;
  commonPrefix += 1;
}

const frames = Math.floor(commonPrefix / 24) * 24;
if (frames < 24) throw new Error("No hay un día completo común entre todos los nodos.");
const lastTimestamp = referenceTimes[frames - 1];
const endDate = lastTimestamp.slice(0, 10);
const encoded = [];
let minTemperature = Infinity;
let maxTemperature = -Infinity;
let maxWindSpeed = 0;

function putInt16(value) {
  if (!Number.isInteger(value) || value < -32768 || value > 32767) {
    throw new Error(`El valor ${value} no cabe en Int16.`);
  }
  const unsigned = value & 0xffff;
  encoded.push(unsigned & 0xff, unsigned >>> 8);
}

function putSignedVarint(delta) {
  let value = delta >= 0 ? delta * 2 : -delta * 2 - 1;
  while (value >= 128) {
    encoded.push((value & 0x7f) | 0x80);
    value = Math.floor(value / 128);
  }
  encoded.push(value);
}

for (const { hourly } of locations) {
  const series = [
    new Int16Array(frames),
    new Int16Array(frames),
    new Int16Array(frames),
  ];

  for (let frame = 0; frame < frames; frame += 1) {
    const temperature = hourly.temperature_2m[frame];
    const speed = hourly.wind_speed_10m[frame];
    const radians = (hourly.wind_direction_10m[frame] * Math.PI) / 180;
    const u = -speed * Math.sin(radians);
    const v = -speed * Math.cos(radians);
    series[0][frame] = Math.round(temperature * TEMP_SCALE);
    series[1][frame] = Math.round(u * WIND_SCALE);
    series[2][frame] = Math.round(v * WIND_SCALE);
    minTemperature = Math.min(minTemperature, temperature);
    maxTemperature = Math.max(maxTemperature, temperature);
    maxWindSpeed = Math.max(maxWindSpeed, speed);
  }

  for (const values of series) {
    putInt16(values[0]);
    for (let frame = 1; frame < frames; frame += 1) {
      putSignedVarint(values[frame] - values[frame - 1]);
    }
  }
}

const encodedBytes = Buffer.from(encoded);
const compressedBytes = gzipSync(encodedBytes, { level: 9 });
const filename = `weather-${startDate}_${endDate}.bin`;
const manifest = {
  version: 1,
  source: "ERA5 via Open-Meteo Historical Weather API",
  geometrySource: "Natural Earth 1:50m",
  generatedAt: new Date().toISOString(),
  frames,
  start: `${startDate}T00:00:00Z`,
  end: `${lastTimestamp}:00Z`,
  coords,
  codec: "delta-varint-gzip-v1",
  tempScale: TEMP_SCALE,
  windScale: WIND_SCALE,
  decodedBytes: encodedBytes.length,
  compressedBytes: compressedBytes.length,
  sha256Compressed: createHash("sha256").update(compressedBytes).digest("hex"),
  asset: `data/${filename}`,
};

await fs.mkdir(outputDirectory, { recursive: true });
await Promise.all([
  fs.writeFile(new URL(filename, outputDirectory), compressedBytes),
  fs.writeFile(
    new URL("weather-manifest.json", outputDirectory),
    `${JSON.stringify(manifest)}\n`,
  ),
]);

console.log(
  JSON.stringify(
    {
      candidateCells: candidates.length,
      selectedNodes: coords.length,
      frames,
      start: manifest.start,
      end: manifest.end,
      encodedBytes: encodedBytes.length,
      gzipBytes: compressedBytes.length,
      minTemperature: Number(minTemperature.toFixed(1)),
      maxTemperature: Number(maxTemperature.toFixed(1)),
      maxWindSpeed: Number(maxWindSpeed.toFixed(2)),
      output: filename,
    },
    null,
    2,
  ),
);
