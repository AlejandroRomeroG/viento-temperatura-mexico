import { gunzipSync } from "fflate";
import { publicAssetUrl } from "./assets";
import type { WeatherManifest, WeatherStation } from "./types";

async function decompressGzip(compressed: Uint8Array) {
  if (typeof DecompressionStream !== "undefined") {
    const buffer = new ArrayBuffer(compressed.byteLength);
    new Uint8Array(buffer).set(compressed);
    const stream = new Blob([buffer])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return gunzipSync(compressed);
}

export async function loadWeather(
  manifest: WeatherManifest,
  signal?: AbortSignal,
): Promise<WeatherStation[]> {
  const response = await fetch(publicAssetUrl(manifest.asset), { signal });
  if (!response.ok) {
    throw new Error(`No se pudieron cargar los datos meteorológicos (${response.status}).`);
  }

  const compressed = new Uint8Array(await response.arrayBuffer());
  if (compressed.byteLength !== manifest.compressedBytes) {
    throw new Error("El archivo meteorológico está incompleto.");
  }
  const bytes = await decompressGzip(compressed);
  if (bytes.byteLength !== manifest.decodedBytes) {
    throw new Error("Los datos meteorológicos descomprimidos no coinciden con el manifiesto.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const readInt16 = () => {
    if (offset + 2 > bytes.length) throw new Error("Serie meteorológica truncada.");
    const value = view.getInt16(offset, true);
    offset += 2;
    return value;
  };

  const readSignedVarint = () => {
    let value = 0;
    let multiplier = 1;
    let byte = 0;
    do {
      if (offset >= bytes.length) throw new Error("Serie meteorológica truncada.");
      byte = bytes[offset];
      offset += 1;
      value += (byte & 0x7f) * multiplier;
      multiplier *= 128;
      if (multiplier > 2 ** 35) throw new Error("Delta meteorológico inválido.");
    } while (byte & 0x80);
    return value & 1 ? -(value + 1) / 2 : value / 2;
  };

  const readSeries = () => {
    const values = new Int16Array(manifest.frames);
    let current = readInt16();
    values[0] = current;
    for (let frame = 1; frame < manifest.frames; frame += 1) {
      current += readSignedVarint();
      values[frame] = current;
    }
    return values;
  };

  const stations = manifest.coords.map(([lon, lat]) => ({
    lon,
    lat,
    temperature: readSeries(),
    u: readSeries(),
    v: readSeries(),
  }));

  if (offset !== bytes.length) {
    throw new Error("El bloque meteorológico contiene bytes inesperados.");
  }
  return stations;
}
