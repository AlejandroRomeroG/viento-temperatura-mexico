"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { publicAssetUrl } from "@/lib/wind/assets";
import { loadWeather } from "@/lib/wind/decode";
import { WindEngine } from "@/lib/wind/engine";
import { legendGradient } from "@/lib/wind/palette";
import type {
  MexicoFeature,
  WeatherManifest,
  WindSample,
} from "@/lib/wind/types";

type LoadStatus = "loading" | "ready" | "error";
type Theme = "dark" | "light";

interface TooltipState extends WindSample {
  left: number;
  top: number;
}

interface TooltipPointer {
  clientX: number;
  clientY: number;
  pointerType: string;
}

function tooltipAtPointer(
  engine: WindEngine,
  canvas: HTMLCanvasElement,
  pointer: TooltipPointer,
): TooltipState | null {
  const bounds = canvas.getBoundingClientRect();
  const x = pointer.clientX - bounds.left;
  const y = pointer.clientY - bounds.top;
  const sample = engine.sampleAt(x, y);
  if (!sample) return null;

  const tooltipWidth = 238;
  const tooltipHeight = 58;
  return {
    ...sample,
    left: Math.max(10, Math.min(x + 14, bounds.width - tooltipWidth - 10)),
    top: Math.max(
      10,
      Math.min(y - tooltipHeight - 14, bounds.height - tooltipHeight - 10),
    ),
  };
}

const longDate = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

const compactDate = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

const initialDate = new Date("2026-07-01T00:00:00Z");

export function WindExperience() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<WindEngine | null>(null);
  const tooltipPointerRef = useRef<TooltipPointer | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState("");
  const [date, setDate] = useState(initialDate);
  const [playing, setPlaying] = useState(false);
  const [maximum, setMaximum] = useState(959);
  const [hairCount, setHairCount] = useState(2800);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    try {
      const saved = window.localStorage.getItem("mx-atmosphere-theme");
      return saved === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [infoOpen, setInfoOpen] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem("mx-atmosphere-theme", theme);
    } catch {
      // Theme persistence is optional when storage is unavailable.
    }
    engineRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    const abortController = new AbortController();
    let engine: WindEngine | null = null;

    async function start() {
      try {
        const [manifestResponse, mexicoResponse] = await Promise.all([
          fetch(publicAssetUrl("data/weather-manifest.json"), {
            signal: abortController.signal,
          }),
          fetch(publicAssetUrl("data/mexico.geojson"), {
            signal: abortController.signal,
          }),
        ]);
        if (!manifestResponse.ok || !mexicoResponse.ok) {
          throw new Error("No se pudieron cargar los archivos de la visualización.");
        }
        const manifest = (await manifestResponse.json()) as WeatherManifest;
        const mexico = (await mexicoResponse.json()) as MexicoFeature;
        const stations = await loadWeather(manifest, abortController.signal);
        if (stations.length !== 240) {
          throw new Error(`Se esperaban 240 nodos y se encontraron ${stations.length}.`);
        }
        if (!canvasRef.current || !stageRef.current || abortController.signal.aborted) return;

        setMaximum(manifest.frames - 1);
        setDate(new Date(manifest.start));
        engine = new WindEngine(
          canvasRef.current,
          stageRef.current,
          mexico,
          manifest,
          stations,
          {
            onFrame(position) {
              if (sliderRef.current) sliderRef.current.value = String(position);
            },
            onSnapshot(snapshot) {
              setDate(snapshot.date);
              setPlaying(snapshot.playing);
              const pointer = tooltipPointerRef.current;
              const canvas = canvasRef.current;
              if (!pointer || !canvas || !engine) return;
              const nextTooltip = tooltipAtPointer(engine, canvas, pointer);
              if (!nextTooltip) tooltipPointerRef.current = null;
              setTooltip(nextTooltip);
            },
            onHairCount(count) {
              setHairCount(count);
            },
          },
        );
        engineRef.current = engine;
        engine.setTheme(
          document.documentElement.dataset.theme === "light" ? "light" : "dark",
        );
        setStatus("ready");
      } catch (reason) {
        if (abortController.signal.aborted) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Ocurrió un error al preparar la visualización.",
        );
        setStatus("error");
      }
    }

    void start();
    return () => {
      abortController.abort();
      engine?.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInfoOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  function togglePlayback() {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setPlaying(!engine.isPlaying());
  }

  function seek(value: string) {
    engineRef.current?.seek(Number(value));
  }

  function inspect(event: PointerEvent<HTMLCanvasElement>) {
    const engine = engineRef.current;
    if (!engine) return;
    const pointer = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType,
    };
    const nextTooltip = tooltipAtPointer(engine, event.currentTarget, pointer);
    tooltipPointerRef.current = nextTooltip ? pointer : null;
    setTooltip(nextTooltip);
  }

  function clearTooltip(event: PointerEvent<HTMLCanvasElement>) {
    if (event.pointerType === "touch" && event.type === "pointerleave") return;
    tooltipPointerRef.current = null;
    setTooltip(null);
  }

  return (
    <main className="site-shell">
      <header className="site-header">
        <div className="brand-block">
          <p className="eyebrow">Atmósfera · México</p>
          <h1>Viento y temperatura sobre México</h1>
        </div>
        <div className="header-meta">
          <div className="project-summary">
            <strong>40 días de atmósfera, hora por hora</strong>
            <span>ERA5 · 240 nodos · 960 horas</span>
          </div>
          <a
            className="author-link"
            href="https://github.com/AlejandroRomeroG"
            target="_blank"
            rel="noreferrer"
          >
            Alejandro Romero González <span aria-hidden="true">↗</span>
          </a>
          <div className="header-actions" aria-label="Opciones de visualización">
            <button
              className="icon-button"
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema oscuro"}
              title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
            >
              <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
            </button>
            <button
              className="icon-button info-button"
              type="button"
              aria-expanded={infoOpen}
              aria-controls="method-panel"
              onClick={() => setInfoOpen((current) => !current)}
              title="Cómo leer la visualización"
            >
              <span aria-hidden="true">i</span>
              <span className="sr-only">Cómo leer la visualización</span>
            </button>
          </div>
        </div>
      </header>

      <section className="visualization-frame" aria-labelledby="canvas-title">
        <h2 id="canvas-title" className="sr-only">
          Campo horario de viento y temperatura sobre México
        </h2>
        <p id="canvas-description" className="sr-only">
          Cada pelo mantiene el mismo largo. Su orientación indica hacia dónde sopla
          el viento, su ondulación y ritmo indican la velocidad, y su color representa
          la temperatura.
        </p>
        <div className="wind-stage" ref={stageRef}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-describedby="canvas-description"
            aria-label="Visualización animada del viento y la temperatura sobre México"
            onPointerMove={inspect}
            onPointerDown={inspect}
            onPointerLeave={clearTooltip}
            onPointerCancel={clearTooltip}
          />

          <div className="period-chip" aria-hidden="true">
            <span className="period-dot" />
            1 jul–9 ago 2026
          </div>

          <div className="temperature-legend" aria-label="Escala de temperatura de 6 a 48 grados Celsius">
            <span>48°</span>
            <div className="legend-bar" style={{ background: legendGradient }} />
            <span>27°</span>
            <span>6°</span>
            <small>°C</small>
          </div>

          {tooltip ? (
            <div
              className="map-tooltip"
              style={{ left: tooltip.left, top: tooltip.top }}
              role="tooltip"
            >
              <strong>{tooltip.temperature.toFixed(1)} °C</strong>
              <span>
                {tooltip.speed.toFixed(1)} m/s · desde {tooltip.cardinal}
              </span>
            </div>
          ) : null}

          {status !== "ready" ? (
            <div className={`load-state ${status === "error" ? "is-error" : ""}`} role="status">
              {status === "loading" ? <span className="loader" aria-hidden="true" /> : null}
              <strong>{status === "loading" ? "Preparando la atmósfera" : "No fue posible cargarla"}</strong>
              <span>{status === "loading" ? "Decodificando 960 horas de ERA5…" : error}</span>
            </div>
          ) : null}

          {infoOpen ? (
            <aside id="method-panel" className="method-panel" aria-label="Cómo leer la visualización">
              <div className="method-heading">
                <p className="eyebrow">Cómo leerlo</p>
                <button type="button" onClick={() => setInfoOpen(false)} aria-label="Cerrar información">
                  Cerrar
                </button>
              </div>
              <h3>Dos variables, un solo gesto</h3>
              <dl>
                <div>
                  <dt>Orientación</dt>
                  <dd>Dirección hacia la que sopla el viento.</dd>
                </div>
                <div>
                  <dt>Ondulación</dt>
                  <dd>Más rápida y marcada cuando aumenta la velocidad.</dd>
                </div>
                <div>
                  <dt>Color</dt>
                  <dd>Temperatura: azul frío, rojo cálido.</dd>
                </div>
                <div>
                  <dt>Largo</dt>
                  <dd>Es fijo y no representa ninguna variable.</dd>
                </div>
              </dl>
              <p className="method-note">
                El campo interpola cuatro de 240 nodos ERA5 cercanos. Las islas pequeñas
                usan el viento de su entorno inmediato.
              </p>
            </aside>
          ) : null}
        </div>
      </section>

      <footer className="control-dock" aria-label="Controles de tiempo">
        <button
          className="play-button"
          type="button"
          onClick={togglePlayback}
          disabled={status !== "ready"}
          aria-pressed={playing}
        >
          <span className={playing ? "pause-mark" : "play-mark"} aria-hidden="true" />
          <span>{playing ? "Pausar" : "Reproducir"}</span>
        </button>
        <div className="time-readout">
          <small>Tiempo universal</small>
          <output>
            <time dateTime={date.toISOString()}>{longDate.format(date)} UTC</time>
          </output>
        </div>
        <div className="timeline-wrap">
          <input
            ref={sliderRef}
            type="range"
            min="0"
            max={maximum}
            step="1"
            defaultValue="0"
            disabled={status !== "ready"}
            aria-label="Momento entre el 1 de julio y el 9 de agosto de 2026"
            aria-valuetext={`${longDate.format(date)} UTC`}
            onInput={(event) => seek(event.currentTarget.value)}
          />
          <div className="timeline-labels" aria-hidden="true">
            <span>1 jul</span>
            <span>{compactDate.format(date)}</span>
            <span>9 ago</span>
          </div>
        </div>
        <div className="data-readout" title="Cantidad aproximada de pelos dibujados">
          <strong>{hairCount.toLocaleString("es-MX")}</strong>
          <span>pelos · largo fijo</span>
        </div>
      </footer>
    </main>
  );
}
