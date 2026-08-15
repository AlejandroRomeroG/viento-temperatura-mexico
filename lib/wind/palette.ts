export const TEMPERATURE_MIN = 6;
export const TEMPERATURE_MAX = 48;

export const INSPIRATION_PALETTE = [
  "#114670",
  "#1c5782",
  "#306c90",
  "#45809a",
  "#5d9aad",
  "#78aabb",
  "#90b7be",
  "#9fbea6",
  "#b2bf86",
  "#cfb46f",
  "#d6a25a",
  "#d09049",
  "#cd803e",
  "#c86440",
] as const;

function parseHex(color: string) {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

export function temperatureColor(amount: number) {
  const clamped = Math.max(0, Math.min(1, amount));
  const scaled = clamped * (INSPIRATION_PALETTE.length - 1);
  const low = Math.floor(scaled);
  const high = Math.min(low + 1, INSPIRATION_PALETTE.length - 1);
  const mix = scaled - low;
  const start = parseHex(INSPIRATION_PALETTE[low]);
  const end = parseHex(INSPIRATION_PALETTE[high]);
  const channels = start.map((channel, index) =>
    Math.round(channel + (end[index] - channel) * mix),
  );
  return `rgb(${channels[0]} ${channels[1]} ${channels[2]})`;
}

export const legendGradient = `linear-gradient(to top, ${INSPIRATION_PALETTE.map(
  (color, index) =>
    `${color} ${((index / (INSPIRATION_PALETTE.length - 1)) * 100).toFixed(2)}%`,
).join(", ")})`;
