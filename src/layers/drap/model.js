// A portable export (package.json): no i18n here. Labels stay English data;
// the Layers panel translates them.
const msg = (text) => text;

/** D-RAP is recomputed every minute or so; half an hour means it stopped. */
export const DRAP_STALE_MS = 30 * 60 * 1000;
/** Frequencies below this (MHz) are not drawn: no meaningful absorption. */
export const DRAP_MIN_MHZ = 0.5;

/** Highest affected frequency stops, MHz. */
const RAMP = Object.freeze([
  { mhz: DRAP_MIN_MHZ, rgb: [70, 170, 255], alpha: 0.25 },
  { mhz: 5, rgb: [80, 210, 200], alpha: 0.4 },
  { mhz: 10, rgb: [235, 215, 60], alpha: 0.5 },
  { mhz: 20, rgb: [245, 140, 50], alpha: 0.55 },
  { mhz: 30, rgb: [235, 60, 55], alpha: 0.6 },
]);
export const DRAP_LEGEND = Object.freeze(
  RAMP.slice(1).map(({ mhz, rgb }, index, stops) => ({
    color: `rgb(${rgb.join(',')})`,
    label: index === stops.length - 1 ? msg('{mhz}+ MHz') : msg('{mhz} MHz'),
    mhz,
  })),
);

const header = (text, name) =>
  text.match(new RegExp(`^#\\s*${name}\\s*:\\s*(.*?)\\s*$`, 'm'))?.[1] ?? '';

/**
 * Parse SWPC's D-RAP global frequency table: the highest frequency (MHz)
 * absorbed by at least 1 dB, by latitude row (north first) and longitude
 * column.
 * @param {string} text `drap_global_frequencies.txt`
 * @returns {{ validMs: number|null, xrayMessage: string, protonMessage: string, lats: number[], lons: number[], values: Float32Array, maxMhz: number, cells: number }|null}
 */
export function parseDrap(text) {
  if (typeof text !== 'string') return null;
  const lines = text.split(/\r?\n/);
  const lonLine = lines.find(
    (line) =>
      !line.startsWith('#') && /^\s*-?\d+(\s+-?\d+){10,}\s*$/.test(line),
  );
  if (!lonLine) return null;
  const lons = lonLine.trim().split(/\s+/).map(Number);
  const lats = [];
  const rows = [];
  for (const line of lines) {
    const match = line.match(/^\s*(-?\d+)\s*\|(.*)$/);
    if (!match) continue;
    const values = match[2].trim().split(/\s+/).map(Number);
    if (values.length !== lons.length || !values.every(Number.isFinite))
      return null;
    lats.push(Number(match[1]));
    rows.push(values);
  }
  if (rows.length < 2) return null;
  const values = new Float32Array(rows.length * lons.length);
  let maxMhz = 0;
  let cells = 0;
  rows.forEach((row, y) =>
    row.forEach((mhz, x) => {
      values[y * lons.length + x] = mhz;
      maxMhz = Math.max(maxMhz, mhz);
      if (mhz >= DRAP_MIN_MHZ) cells++;
    }),
  );
  const valid = Date.parse(
    header(text, 'Product Valid At').replace(' UTC', 'Z').replace(' ', 'T'),
  );
  return {
    validMs: Number.isFinite(valid) ? valid : null,
    xrayMessage: header(text, 'X-RAY Message'),
    protonMessage: header(text, 'Proton Message'),
    lats,
    lons,
    values,
    maxMhz,
    cells,
  };
}

/** Straight-alpha RGBA for one highest-affected frequency. */
export function drapPixel(mhz) {
  if (!(mhz >= DRAP_MIN_MHZ)) return [0, 0, 0, 0];
  const upper = RAMP.findIndex((stop) => mhz < stop.mhz);
  if (upper === -1) {
    const { rgb, alpha } = RAMP.at(-1);
    return [...rgb, Math.round(alpha * 255)];
  }
  const low = RAMP[upper - 1];
  const high = RAMP[upper];
  const t = (mhz - low.mhz) / (high.mhz - low.mhz);
  const mix = (a, b) => Math.round(a + (b - a) * t);
  return [
    mix(low.rgb[0], high.rgb[0]),
    mix(low.rgb[1], high.rgb[1]),
    mix(low.rgb[2], high.rgb[2]),
    Math.round(mix(low.alpha * 255, high.alpha * 255)),
  ];
}

/**
 * One pixel per table cell. The table's rows (89°N … 89°S, 2° apart) and
 * columns (178°W … 178°E, 4° apart) are cell centres, so the grid tiles the
 * whole Earth exactly and drapes on Rectangle.MAX_VALUE.
 */
export function createDrapRaster({ lats, lons, values }) {
  const width = lons.length;
  const height = lats.length;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++)
    rgba.set(drapPixel(values[i]), i * 4);
  return { width, height, rgba };
}
