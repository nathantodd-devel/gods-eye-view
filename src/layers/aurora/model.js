// A portable export (package.json): no i18n here. Labels stay English data;
// the Layers panel translates them.
const msg = (text) => text;

/** OVATION is a 1° grid: longitudes 0–359, latitudes -90–90. */
const OVATION_WIDTH = 360;
const OVATION_HEIGHT = 181;
/** Below this probability the oval is not drawn. */
export const AURORA_MIN_PERCENT = 10;
/** OVATION is rerun about every five minutes; twenty-five means it stopped. */
export const AURORA_STALE_MS = 25 * 60 * 1000;

/** Probability stops for the oval ramp: green, yellow, red. */
const RAMP = Object.freeze([
  { percent: AURORA_MIN_PERCENT, rgb: [40, 220, 110], alpha: 0.35 },
  { percent: 30, rgb: [235, 220, 60], alpha: 0.5 },
  { percent: 60, rgb: [240, 70, 60], alpha: 0.6 },
]);
export const AURORA_LEGEND = Object.freeze(
  RAMP.map(({ percent, rgb }, index) => ({
    color: `rgb(${rgb.join(',')})`,
    label: index === RAMP.length - 1 ? msg('{percent}%+') : msg('{percent}%'),
    percent,
  })),
);

const parseTime = (value) => {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Validate an OVATION aurora nowcast into a probability grid.
 * @param {object} payload `ovation_aurora_latest.json`
 * @returns {{ observedMs: number|null, forecastMs: number|null, grid: Uint8Array, peakPercent: number, cells: number }|null}
 */
export function parseOvation(payload) {
  const rows = payload?.coordinates;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const grid = new Uint8Array(OVATION_WIDTH * OVATION_HEIGHT);
  let accepted = 0;
  let peakPercent = 0;
  let cells = 0;
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const [lon, lat, value] = row;
    if (![lon, lat, value].every(Number.isFinite)) continue;
    const x = ((Math.round(lon) % 360) + 360) % 360;
    const y = Math.round(lat) + 90;
    if (y < 0 || y >= OVATION_HEIGHT) continue;
    const percent = Math.max(0, Math.min(100, Math.round(value)));
    grid[y * OVATION_WIDTH + x] = percent;
    accepted++;
    peakPercent = Math.max(peakPercent, percent);
    if (percent >= AURORA_MIN_PERCENT) cells++;
  }
  if (accepted === 0) return null;
  return {
    observedMs: parseTime(payload['Observation Time']),
    forecastMs: parseTime(payload['Forecast Time']),
    grid,
    peakPercent,
    cells,
  };
}

/** Straight-alpha RGBA for one probability; below the floor is clear. */
export function auroraPixel(percent) {
  if (!(percent >= AURORA_MIN_PERCENT)) return [0, 0, 0, 0];
  const upper = RAMP.findIndex((stop) => percent < stop.percent);
  if (upper === -1) {
    const { rgb, alpha } = RAMP.at(-1);
    return [...rgb, Math.round(alpha * 255)];
  }
  const low = RAMP[upper - 1];
  const high = RAMP[upper];
  const t = (percent - low.percent) / (high.percent - low.percent);
  const mix = (a, b) => Math.round(a + (b - a) * t);
  return [
    mix(low.rgb[0], high.rgb[0]),
    mix(low.rgb[1], high.rgb[1]),
    mix(low.rgb[2], high.rgb[2]),
    Math.round(mix(low.alpha * 255, high.alpha * 255)),
  ];
}

/**
 * Equirectangular 1° raster (row 0 at 90°N, column 0 at 180°W) sampled from
 * the OVATION grid at each cell centre, averaging the two grid rows it sits
 * between.
 */
export function createAuroraRaster({ grid }) {
  const width = 360;
  const height = 180;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    // Cell centre 89.5°N … 89.5°S lies between grid rows lat ± 0.5.
    const north = 90 - y + 90;
    const south = north - 1;
    for (let x = 0; x < width; x++) {
      const lon = ((x - 180 + 0.5 + 360) % 360) | 0;
      const percent =
        (grid[north * OVATION_WIDTH + lon] +
          grid[south * OVATION_WIDTH + lon]) /
        2;
      rgba.set(auroraPixel(percent), (y * width + x) * 4);
    }
  }
  return { width, height, rgba };
}
