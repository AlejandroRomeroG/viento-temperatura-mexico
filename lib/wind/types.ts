import type { Feature, MultiPolygon, Polygon } from "geojson";

export type MexicoFeature = Feature<MultiPolygon | Polygon>;

export interface WeatherManifest {
  version: number;
  source: string;
  geometrySource: string;
  generatedAt: string;
  frames: number;
  start: string;
  end: string;
  coords: [number, number][];
  codec: "delta-varint-gzip-v1";
  tempScale: number;
  windScale: number;
  decodedBytes: number;
  compressedBytes: number;
  sha256Compressed: string;
  asset: string;
}

export interface WeatherStation {
  lon: number;
  lat: number;
  temperature: Int16Array;
  u: Int16Array;
  v: Int16Array;
}

export interface WindSample {
  temperature: number;
  u: number;
  v: number;
  speed: number;
  cardinal: string;
}

export interface EngineSnapshot {
  position: number;
  date: Date;
  playing: boolean;
}
