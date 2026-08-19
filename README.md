<div align="center">
  <h1>Viento y temperatura sobre México</h1>
  <p><strong>40 días de atmósfera, hora por hora.</strong></p>
  <p>Una visualización interactiva donde el viento y la temperatura convierten el territorio en una superficie viva.</p>
  <p>
    <a href="https://github.com/AlejandroRomeroG/viento-temperatura-mexico/actions/workflows/deploy-pages.yml"><img alt="Estado de GitHub Pages" src="https://github.com/AlejandroRomeroG/viento-temperatura-mexico/actions/workflows/deploy-pages.yml/badge.svg"></a>
    <a href="https://alejandroromerog.github.io/viento-temperatura-mexico/"><img alt="Abrir sitio" src="https://img.shields.io/badge/sitio-abrir-114670?style=flat-square"></a>
    <img alt="240 nodos de muestreo" src="https://img.shields.io/badge/nodos-240-306c90?style=flat-square">
    <img alt="960 horas" src="https://img.shields.io/badge/horas-960-78aabb?style=flat-square">
    <img alt="40 días" src="https://img.shields.io/badge/periodo-40_días-d09049?style=flat-square">
  </p>
  <p>
    <a href="#cobertura">Cobertura</a> ·
    <a href="#lectura-visual">Lectura visual</a> ·
    <a href="#controles">Controles</a> ·
    <a href="#fuentes-y-metodología">Fuentes y metodología</a> ·
    <a href="#inicio-rápido">Inicio rápido</a> ·
    <a href="#arquitectura">Arquitectura</a>
  </p>
</div>

El proyecto representa 960 horas de viento y temperatura sobre México. Prescinde del mapa base y reduce la escena a dos variables atmosféricas: cada pelo mantiene un largo constante, se orienta hacia donde sopla el viento, se ondula y anima según su velocidad y cambia de color con la temperatura. Como los trazos no se recortan en la costa, la silueta conserva el carácter orgánico de la referencia visual.

**Sitio público:** [alejandroromerog.github.io/viento-temperatura-mexico](https://alejandroromerog.github.io/viento-temperatura-mexico/)

## Cobertura

| Cobertura | Detalle |
|---|---|
| Territorio | México continental y 15 componentes insulares de la geometría Natural Earth |
| Periodo | 1 de julio de 2026, 00:00 UTC — 9 de agosto de 2026, 23:00 UTC |
| Resolución temporal | 960 muestras horarias, equivalentes a 40 días completos |
| Muestreo espacial | 240 nodos seleccionados de la retícula ERA5 de 0.25° |
| Temperatura | Aire a 2 m sobre la superficie, en °C |
| Viento | Componentes horizontales a 10 m, en m/s |
| Representación | Cerca de 2,800 pelos, con al menos uno sobre cada componente insular |

## Lectura visual

| Señal | Significado |
|---|---|
| Orientación | Dirección hacia la que sopla el viento |
| Ondulación | Intensidad del viento: aumenta conforme sube la velocidad |
| Ritmo | Rapidez del viento: acelera cuando el flujo es más fuerte |
| Color | Temperatura, desde azul profundo hasta rojo cálido |
| Largo | Constante; no representa ninguna variable |

La reproducción recorre las 960 horas en cerca de un minuto. El campo se interpola continuamente entre horas, por lo que el movimiento no avanza a saltos aunque los datos originales tengan resolución horaria.

## Controles

| Acción | Escritorio | Dispositivo táctil |
|---|---|---|
| Reproducir o pausar | Botón inferior izquierdo | Tocar el botón inferior izquierdo |
| Recorrer el periodo | Arrastrar la línea de tiempo | Deslizar la línea de tiempo |
| Consultar un punto | Mover el cursor sobre México | Tocar un punto del territorio |
| Cambiar de tema | Botón de tema en el encabezado | Tocar el botón de tema |
| Leer la metodología | Botón de información | Tocar el botón de información |

La consulta puntual muestra temperatura, velocidad y procedencia cardinal estimadas para la posición elegida, y sus valores se actualizan mientras avanza la línea de tiempo.

## Fuentes y metodología

| Insumo | Fuente | Uso |
|---|---|---|
| Reanálisis meteorológico | [ERA5 vía Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) | Temperatura a 2 m, velocidad y dirección del viento a 10 m |
| Geometría nacional | [Natural Earth Admin 0, escala 1:50m](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/) | Silueta terrestre e identificación de componentes insulares |
| Proyección | Cónica conforme | Ajuste de México al lienzo sin mapa base |

### Procesamiento de datos

1. Se generan los centros de celda ERA5 de 0.25° contenidos en la geometría de México.
2. Se eligen 240 nodos mediante muestreo de punto más lejano para repartirlos de forma uniforme sobre el territorio.
3. Open-Meteo entrega temperatura, velocidad y dirección horarias; la dirección meteorológica se transforma en componentes `u` y `v`.
4. Cada pelo interpola los cuatro nodos más cercanos con ponderación por distancia.
5. La temperatura se cuantiza a décimas de grado y el viento a vigésimas de m/s. Las series se codifican como un valor inicial seguido de deltas ZigZag/LEB128 y se comprimen con gzip.
6. El navegador descarga el paquete meteorológico una vez, lo decodifica localmente y dibuja el campo con Canvas 2D.

La paleta se construyó a partir de la imagen de inspiración: azul profundo, azul claro, verde suave, amarillo, naranja y rojo. La transición es continua entre 6 y 48 °C.

## Inicio rápido

Requiere Node.js `>=22.13.0`.

```bash
git clone https://github.com/AlejandroRomeroG/viento-temperatura-mexico.git
cd viento-temperatura-mexico
npm ci
npm run dev:pages
```

El servidor local muestra en la terminal la dirección que debe abrirse. La versión publicada no consulta APIs durante la interacción: geometría y meteorología viajan como recursos estáticos del repositorio.

| Comando | Función |
|---|---|
| `npm run dev:pages` | Inicia la versión estática en desarrollo |
| `npm run build:pages` | Genera el sitio de GitHub Pages en `dist-pages/` |
| `npm run preview:pages` | Sirve localmente la compilación estática |
| `npm run lint` | Ejecuta la revisión estática del código |
| `npm run typecheck` | Comprueba los tipos de la aplicación y el motor |
| `npm test` | Compila ambas salidas y valida interfaz, datos y despliegue |
| `npm run data:update` | Consulta ERA5 y regenera el paquete meteorológico |

Para fijar el último día solicitado durante una actualización:

```bash
ERA5_END_DATE=2026-08-09 npm run data:update
```

## Arquitectura

| Ruta | Responsabilidad |
|---|---|
| `index.html` | Documento estático, metadatos y punto de entrada de GitHub Pages |
| `src/main.tsx` | Montaje de la experiencia interactiva en el navegador |
| `app/` | Shell alternativo y estilos globales |
| `components/WindExperience.tsx` | Interfaz, controles y estados accesibles |
| `lib/wind/engine.ts` | Proyección, interpolación y animación en Canvas 2D |
| `lib/wind/decode.ts` | Descompresión y reconstrucción de las series horarias |
| `lib/wind/palette.ts` | Escala cromática de temperatura |
| `public/data/` | Geometría, manifiesto y paquete meteorológico comprimido |
| `scripts/update-data.mjs` | Adquisición y empaquetado reproducible de ERA5 |
| `.github/workflows/deploy-pages.yml` | Construcción y publicación automática en GitHub Pages |
| `tests/` | Validación de HTML, cobertura de datos y artefacto estático |

El motor mantiene la animación fuera del estado de React. Para cada pelo precalcula los nodos vecinos y la base local de la proyección; durante cada cuadro solo interpola el campo, actualiza el gesto y agrupa los trazos por color.

## Privacidad y accesibilidad

- No incluye analítica, cookies, formularios ni almacenamiento de información personal.
- La única preferencia persistente en el navegador es el tema oscuro o claro.
- La línea de tiempo y los botones admiten teclado y muestran foco visible.
- `prefers-reduced-motion` desactiva la reproducción automática y reduce la ondulación, sin bloquear la reproducción manual.
- El lienzo tiene una descripción textual de la codificación visual y los controles exponen nombres accesibles.

## Alcance y límites

- ERA5 es un reanálisis de escala regional, no una medición puntual ni un pronóstico en vivo.
- El campo entre los 240 nodos es una interpolación visual; no debe usarse para decisiones operativas o de seguridad.
- La cobertura termina el 9 de agosto de 2026 a las 23:00 UTC y no se actualiza automáticamente.
- Las islas muy pequeñas no contienen un centro ERA5 propio; su pelo usa los nodos cercanos y representa el entorno inmediato.
- La escala de color permanece fija entre 6 y 48 °C para conservar comparabilidad durante todo el periodo.
- El largo de los pelos es deliberadamente constante: la velocidad solo modifica ondulación y ritmo.

## Autor

Creado y mantenido por **Alejandro Romero González**.

- Sitio personal: [alejandroromerog.github.io](https://alejandroromerog.github.io/)
- GitHub: [@AlejandroRomeroG](https://github.com/AlejandroRomeroG)
