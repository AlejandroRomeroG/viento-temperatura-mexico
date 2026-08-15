import {
  geoConicConformal,
  geoContains,
  geoPath,
  type GeoConicProjection,
} from "d3-geo";
import {
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
  temperatureColor,
} from "./palette";
import type {
  EngineSnapshot,
  MexicoFeature,
  WeatherManifest,
  WeatherStation,
  WindSample,
} from "./types";

const DATA_FRAME_MS = 60;
const MAX_WIND = 12.1;
const HAIR_LENGTH = 22;
const TARGET_HAIRS = 2800;
const COLOR_BINS = 64;
const DEG = Math.PI / 180;
const MOBILE_STAGE_MAX_WIDTH = 560;
const MOBILE_HORIZONTAL_PADDING = 18;
const DESKTOP_HORIZONTAL_PADDING = 46;

type Neighbor = [index: number, weight: number];

interface Hair {
  x: number;
  y: number;
  lon: number;
  lat: number;
  neighbors: Neighbor[];
  angle: number;
  phase: number;
  seed: number;
  rate: number;
  eastX: number;
  eastY: number;
  northX: number;
  northY: number;
}

interface EngineCallbacks {
  onFrame: (position: number) => void;
  onSnapshot: (snapshot: EngineSnapshot) => void;
  onHairCount: (count: number) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, amount: number) {
  return a + (b - a) * amount;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function cardinalFromVector(u: number, v: number) {
  const fromDegrees = (Math.atan2(-u, -v) / DEG + 360) % 360;
  const points = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSO",
    "SO",
    "OSO",
    "O",
    "ONO",
    "NO",
    "NNO",
  ];
  return points[Math.round(fromDegrees / 22.5) % 16];
}

export class WindEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly stage: HTMLElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly mexico: MexicoFeature;
  private readonly manifest: WeatherManifest;
  private readonly stations: WeatherStation[];
  private readonly callbacks: EngineCallbacks;
  private readonly currentField: Float32Array;
  private readonly reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private readonly resizeObserver: ResizeObserver;
  private readonly intersectionObserver: IntersectionObserver;
  private projection: GeoConicProjection | null = null;
  private mexicoPath: Path2D | null = null;
  private hairs: Hair[] = [];
  private width = 1;
  private height = 1;
  private dpr = 1;
  private position = 0;
  private motionTime = 0;
  private playing: boolean;
  private onScreen = true;
  private animationFrame = 0;
  private lastNow = 0;
  private lastPaint = 0;
  private lastSnapshotKey = "";
  private lightTheme = false;
  private destroyed = false;

  constructor(
    canvas: HTMLCanvasElement,
    stage: HTMLElement,
    mexico: MexicoFeature,
    manifest: WeatherManifest,
    stations: WeatherStation[],
    callbacks: EngineCallbacks,
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Este navegador no puede dibujar la visualización.");
    this.canvas = canvas;
    this.stage = stage;
    this.context = context;
    this.mexico = mexico;
    this.manifest = manifest;
    this.stations = stations;
    this.callbacks = callbacks;
    this.currentField = new Float32Array(stations.length * 3);
    this.playing = !this.reduceMotion.matches;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(stage);
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.onScreen = entries[0]?.isIntersecting ?? true;
      this.lastNow = 0;
      if (this.onScreen) this.requestDraw();
    });
    this.intersectionObserver.observe(stage);
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.reduceMotion.addEventListener("change", this.handleReducedMotion);

    this.stationFrame(0);
    this.resize(true);
    this.emitSnapshot(true);
    this.requestDraw();
  }

  private handleVisibility = () => {
    this.lastNow = 0;
    if (!document.hidden) this.requestDraw();
  };

  private handleReducedMotion = () => {
    if (this.reduceMotion.matches) this.playing = false;
    this.emitSnapshot(true);
    this.requestDraw();
  };

  private stationFrame(position: number) {
    const low = Math.floor(position);
    const high = Math.min(low + 1, this.manifest.frames - 1);
    const amount = position - low;
    for (let index = 0; index < this.stations.length; index += 1) {
      const station = this.stations[index];
      const base = index * 3;
      this.currentField[base] =
        lerp(station.temperature[low], station.temperature[high], amount) /
        this.manifest.tempScale;
      this.currentField[base + 1] =
        lerp(station.u[low], station.u[high], amount) / this.manifest.windScale;
      this.currentField[base + 2] =
        lerp(station.v[low], station.v[high], amount) / this.manifest.windScale;
    }
  }

  private weightsFor(lon: number, lat: number): Neighbor[] {
    const cosLat = Math.max(0.35, Math.cos(lat * DEG));
    const bestDistances = [Infinity, Infinity, Infinity, Infinity];
    const bestIndexes = [-1, -1, -1, -1];

    for (let index = 0; index < this.stations.length; index += 1) {
      const station = this.stations[index];
      const dx = (station.lon - lon) * cosLat;
      const dy = station.lat - lat;
      const distance2 = dx * dx + dy * dy;
      if (distance2 >= bestDistances[3]) continue;
      let slot = 3;
      while (slot > 0 && distance2 < bestDistances[slot - 1]) {
        bestDistances[slot] = bestDistances[slot - 1];
        bestIndexes[slot] = bestIndexes[slot - 1];
        slot -= 1;
      }
      bestDistances[slot] = distance2;
      bestIndexes[slot] = index;
    }

    if (bestDistances[0] < 0.0001) return [[bestIndexes[0], 1]];
    const raw = bestIndexes.map((index, slot) => [
      index,
      1 / Math.pow(bestDistances[slot] + 0.12, 1.3),
    ]) as Neighbor[];
    const total = raw.reduce((sum, item) => sum + item[1], 0);
    return raw.map(([index, weight]) => [index, weight / total]);
  }

  private sampleWeights(weights: Neighbor[]) {
    let temperature = 0;
    let u = 0;
    let v = 0;
    for (const [index, weight] of weights) {
      const base = index * 3;
      temperature += this.currentField[base] * weight;
      u += this.currentField[base + 1] * weight;
      v += this.currentField[base + 2] * weight;
    }
    return { temperature, u, v };
  }

  private angleFor(hair: Hair, u: number, v: number) {
    const x = u * hair.eastX + v * hair.northX;
    const y = u * hair.eastY + v * hair.northY;
    return Math.atan2(y, x);
  }

  private blendAngle(current: number, target: number, amount: number) {
    const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    return current + delta * amount;
  }

  private rebuildHairs() {
    if (!this.projection) return;
    const path = geoPath(this.projection);
    const projectedArea = Math.max(1, path.area(this.mexico));
    const spacing = clamp(Math.sqrt(projectedArea / TARGET_HAIRS), 2.7, 8.5);
    const bounds = path.bounds(this.mexico);
    const random = mulberry32(20260701 + Math.round(this.width) * 31 + Math.round(this.height));
    const hairs: Hair[] = [];

    const pushHair = (x: number, y: number, lonLat: [number, number]) => {
      if (!this.projection) return;
      const neighbors = this.weightsFor(lonLat[0], lonLat[1]);
      const sample = this.sampleWeights(neighbors);
      const cosLat = Math.max(0.25, Math.cos(lonLat[1] * DEG));
      const east = this.projection([lonLat[0] + 0.025 / cosLat, lonLat[1]]);
      const north = this.projection([lonLat[0], lonLat[1] + 0.025]);
      if (!east || !north) return;
      const hair: Hair = {
        x,
        y,
        lon: lonLat[0],
        lat: lonLat[1],
        neighbors,
        angle: 0,
        phase: random() * Math.PI * 2,
        seed: random() * Math.PI * 2,
        rate: 0.84 + random() * 0.32,
        eastX: east[0] - x,
        eastY: east[1] - y,
        northX: north[0] - x,
        northY: north[1] - y,
      };
      hair.angle = this.angleFor(hair, sample.u, sample.v);
      hairs.push(hair);
    };

    for (let y = bounds[0][1]; y <= bounds[1][1]; y += spacing) {
      for (let x = bounds[0][0]; x <= bounds[1][0]; x += spacing) {
        const px = x + (random() - 0.5) * spacing * 0.72;
        const py = y + (random() - 0.5) * spacing * 0.72;
        const lonLat = this.projection.invert?.([px, py]);
        if (!lonLat || !geoContains(this.mexico, lonLat)) continue;
        pushHair(px, py, lonLat as [number, number]);
      }
    }

    const polygons =
      this.mexico.geometry.type === "MultiPolygon"
        ? this.mexico.geometry.coordinates
        : [this.mexico.geometry.coordinates];
    const mainlandIndex = polygons
      .map((coordinates, index) => ({
        index,
        area: path.area({ type: "Polygon", coordinates }),
      }))
      .sort((a, b) => b.area - a.area)[0]?.index ?? 0;

    for (let index = 0; index < polygons.length; index += 1) {
      if (index === mainlandIndex) continue;
      const island: MexicoFeature = {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: polygons[index] },
      };
      if (hairs.some((hair) => geoContains(island, [hair.lon, hair.lat]))) continue;

      let point = path.centroid(island);
      let lonLat = this.projection.invert?.(point);
      if (!lonLat || !geoContains(island, lonLat)) {
        const islandBounds = path.bounds(island);
        lonLat = null;
        for (let attempt = 0; attempt < 80; attempt += 1) {
          const candidate: [number, number] = [
            lerp(islandBounds[0][0], islandBounds[1][0], random()),
            lerp(islandBounds[0][1], islandBounds[1][1], random()),
          ];
          const candidateLonLat = this.projection.invert?.(candidate);
          if (candidateLonLat && geoContains(island, candidateLonLat)) {
            point = candidate;
            lonLat = candidateLonLat;
            break;
          }
        }
      }
      if (!lonLat) {
        const fallback = polygons[index]?.[0]?.[0];
        if (!fallback) continue;
        lonLat = [fallback[0], fallback[1]];
        point = this.projection(lonLat as [number, number]) ?? point;
      }
      pushHair(point[0], point[1], lonLat as [number, number]);
    }

    this.hairs = hairs;
    this.callbacks.onHairCount(hairs.length);
  }

  private resize(force = false) {
    const bounds = this.stage.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    if (!force && Math.abs(width - this.width) < 1 && Math.abs(height - this.height) < 1) return;
    this.width = width;
    this.height = height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const horizontalPadding =
      width < MOBILE_STAGE_MAX_WIDTH
        ? MOBILE_HORIZONTAL_PADDING
        : DESKTOP_HORIZONTAL_PADDING;
    const verticalPadding = height < 420 ? 20 : 34;
    this.projection = geoConicConformal()
      .parallels([17.5, 29.5])
      .rotate([102, 0])
      .center([0, 23])
      .precision(0.1)
      .fitExtent(
        [
          [horizontalPadding, verticalPadding],
          [width - horizontalPadding, height - verticalPadding],
        ],
        this.mexico,
      );

    const pathString = geoPath(this.projection)(this.mexico);
    this.mexicoPath = pathString ? new Path2D(pathString) : null;
    this.rebuildHairs();
    this.requestDraw();
  }

  private addHair(
    path: Path2D,
    hair: Hair,
    angle: number,
    amplitude: number,
    phase: number,
  ) {
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const normalX = -directionY;
    const normalY = directionX;
    const segments = 7;
    for (let index = 0; index <= segments; index += 1) {
      const progress = index / segments;
      const envelope = Math.pow(progress, 1.65);
      const wave =
        Math.sin(phase + 5.6 * progress) +
        0.36 * Math.sin(phase * 0.71 + 10.8 * progress + hair.seed);
      const bend = amplitude * envelope * wave;
      const x = hair.x + directionX * HAIR_LENGTH * progress + normalX * bend;
      const y = hair.y + directionY * HAIR_LENGTH * progress + normalY * bend;
      if (index === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
  }

  private draw(deltaSeconds: number) {
    if (!this.mexicoPath) return;
    const context = this.context;
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    context.fillStyle = this.lightTheme ? "#e8ebe6" : "#090d11";
    context.fill(this.mexicoPath);
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";

    const paths = Array.from({ length: COLOR_BINS }, () => new Path2D());
    const smoothing = this.playing
      ? 1 - Math.exp(-Math.max(deltaSeconds, 1 / 120) / 0.24)
      : 1;
    const motionFactor = this.reduceMotion.matches ? 0.12 : 1;

    for (const hair of this.hairs) {
      const sample = this.sampleWeights(hair.neighbors);
      const speed = Math.hypot(sample.u, sample.v);
      const speedAmount = clamp(speed / MAX_WIND, 0, 1);
      const targetAngle = this.angleFor(hair, sample.u, sample.v);
      hair.angle = this.blendAngle(hair.angle, targetAngle, smoothing);
      const amplitude = lerp(0.35, 3.8, speedAmount) * motionFactor;
      const phase =
        hair.phase + this.motionTime * (1.25 + speedAmount * 5.4) * hair.rate;
      const temperatureAmount = clamp(
        (sample.temperature - TEMPERATURE_MIN) /
          (TEMPERATURE_MAX - TEMPERATURE_MIN),
        0,
        0.9999,
      );
      const bin = Math.floor(temperatureAmount * COLOR_BINS);
      this.addHair(paths[bin], hair, hair.angle, amplitude, phase);
    }

    for (let bin = 0; bin < COLOR_BINS; bin += 1) {
      context.strokeStyle = temperatureColor((bin + 0.5) / COLOR_BINS);
      context.globalAlpha = this.lightTheme ? 0.12 : 0.16;
      context.lineWidth = 2.5;
      context.stroke(paths[bin]);
      context.globalAlpha = this.lightTheme ? 0.9 : 0.84;
      context.lineWidth = 0.82;
      context.stroke(paths[bin]);
    }

    context.restore();
    context.strokeStyle = this.lightTheme ? "#223038" : "#d9e5e3";
    context.globalAlpha = this.lightTheme ? 0.12 : 0.15;
    context.lineWidth = 0.8;
    context.stroke(this.mexicoPath);
    context.globalAlpha = 1;
  }

  private dateForPosition(position: number) {
    const roundedHour = Math.round(position);
    return new Date(Date.parse(this.manifest.start) + roundedHour * 60 * 60 * 1000);
  }

  private emitSnapshot(force = false) {
    const key = `${Math.round(this.position)}:${this.playing}`;
    this.callbacks.onFrame(this.position);
    if (!force && key === this.lastSnapshotKey) return;
    this.lastSnapshotKey = key;
    this.callbacks.onSnapshot({
      position: this.position,
      date: this.dateForPosition(this.position),
      playing: this.playing,
    });
  }

  private requestDraw() {
    if (
      !this.animationFrame &&
      this.onScreen &&
      !document.hidden &&
      !this.destroyed
    ) {
      this.animationFrame = requestAnimationFrame(this.tick);
    }
  }

  private tick = (now: number) => {
    this.animationFrame = 0;
    if (this.destroyed) return;
    if (this.playing && this.lastPaint && now - this.lastPaint < 32) {
      this.requestDraw();
      return;
    }

    const deltaSeconds = this.lastNow ? Math.min((now - this.lastNow) / 1000, 0.08) : 0;
    this.lastNow = now;
    this.lastPaint = now;
    if (this.playing && this.onScreen && !document.hidden) {
      this.position += (deltaSeconds * 1000) / DATA_FRAME_MS;
      this.motionTime += deltaSeconds;
      if (this.position >= this.manifest.frames - 1) {
        this.position = this.manifest.frames - 1;
        this.playing = false;
      }
    }

    this.stationFrame(this.position);
    this.emitSnapshot();
    this.draw(deltaSeconds);
    if (this.playing) this.requestDraw();
  };

  setTheme(theme: "dark" | "light") {
    this.lightTheme = theme === "light";
    this.requestDraw();
  }

  setPlaying(next: boolean) {
    if (next && this.position >= this.manifest.frames - 1) this.position = 0;
    this.playing = next;
    this.lastNow = 0;
    this.emitSnapshot(true);
    this.requestDraw();
  }

  seek(position: number) {
    this.position = clamp(position, 0, this.manifest.frames - 1);
    this.playing = false;
    this.lastNow = 0;
    this.stationFrame(this.position);
    this.emitSnapshot(true);
    this.requestDraw();
  }

  isPlaying() {
    return this.playing;
  }

  sampleAt(x: number, y: number): WindSample | null {
    if (!this.projection) return null;
    const lonLat = this.projection.invert?.([x, y]);
    if (!lonLat || !geoContains(this.mexico, lonLat)) return null;
    const sample = this.sampleWeights(this.weightsFor(lonLat[0], lonLat[1]));
    const speed = Math.hypot(sample.u, sample.v);
    return {
      ...sample,
      speed,
      cardinal: cardinalFromVector(sample.u, sample.v),
    };
  }

  destroy() {
    this.destroyed = true;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.reduceMotion.removeEventListener("change", this.handleReducedMotion);
  }
}
