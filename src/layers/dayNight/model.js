import { subsolarPoint } from '../../data/satellitePass.js';

// A portable export (package.json): no i18n here. Labels stay English data;
// the Layers panel translates them.
const msg = (text) => text;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Raster size: 0.5° cells, fine enough for a smooth terminator. */
export const DAY_NIGHT_RASTER = Object.freeze({ width: 720, height: 360 });
/**
 * The gray line: the twilight strip from the end of civil twilight to just
 * past sunrise, where low-band DX enhancement happens.
 */
export const GRAY_LINE_DEG = Object.freeze({ low: -6, high: 0.8 });
/** Night darkens through astronomical twilight to full depth at -18°. */
const ASTRONOMICAL_DEG = -18;
const NIGHT_RGB = [2, 6, 22];
const GRAY_LINE_RGB = [255, 170, 60];
const NIGHT_ALPHA = { start: 0.25, full: 0.75 };
const GRAY_LINE_ALPHA = 0.3;
/** Camera heights (m) between which the shading fades in. */
export const DAY_NIGHT_FADE_M = Object.freeze({
  low: 300_000,
  high: 3_000_000,
});

export const DAY_NIGHT_LEGEND = Object.freeze([
  { color: `rgb(${GRAY_LINE_RGB.join(',')})`, label: msg('Gray line') },
  { color: `rgb(${NIGHT_RGB.join(',')})`, label: msg('Night') },
]);

/**
 * Sun elevation above the horizon at a point, for a given subsolar point.
 * @returns {number} Degrees in [-90, 90]
 */
export function solarElevationDeg(latDeg, lonDeg, subsolar) {
  const phi = latDeg * D2R;
  const dec = subsolar.latDeg * D2R;
  const sinElev =
    Math.sin(phi) * Math.sin(dec) +
    Math.cos(phi) * Math.cos(dec) * Math.cos((lonDeg - subsolar.lonDeg) * D2R);
  return Math.asin(Math.max(-1, Math.min(1, sinElev))) * R2D;
}

/** Straight-alpha RGBA for one sun elevation; day is fully transparent. */
export function dayNightPixel(elevationDeg) {
  const night =
    elevationDeg < 0
      ? NIGHT_ALPHA.start +
        (NIGHT_ALPHA.full - NIGHT_ALPHA.start) *
          Math.min(1, elevationDeg / ASTRONOMICAL_DEG)
      : 0;
  const mid = (GRAY_LINE_DEG.low + GRAY_LINE_DEG.high) / 2;
  const halfWidth = (GRAY_LINE_DEG.high - GRAY_LINE_DEG.low) / 2;
  const band =
    elevationDeg > GRAY_LINE_DEG.low && elevationDeg < GRAY_LINE_DEG.high
      ? GRAY_LINE_ALPHA * (1 - Math.abs(elevationDeg - mid) / halfWidth)
      : 0;
  // The gray line composites over the night shade.
  const alpha = band + night * (1 - band);
  if (alpha <= 0) return [0, 0, 0, 0];
  const mix = (index) =>
    Math.round(
      (GRAY_LINE_RGB[index] * band + NIGHT_RGB[index] * night * (1 - band)) /
        alpha,
    );
  return [mix(0), mix(1), mix(2), Math.round(alpha * 255)];
}

/**
 * Equirectangular day/night raster: row 0 at 90°N, column 0 at 180°W.
 * @param {number} dateMs
 * @returns {{ width: number, height: number, rgba: Uint8ClampedArray, subsolar: { latDeg: number, lonDeg: number } }}
 */
export function createDayNightRaster(dateMs, size = DAY_NIGHT_RASTER) {
  const { width, height } = size;
  const subsolar = subsolarPoint(dateMs);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const lat = 90 - ((y + 0.5) * 180) / height;
    for (let x = 0; x < width; x++) {
      const lon = -180 + ((x + 0.5) * 360) / width;
      const pixel = dayNightPixel(solarElevationDeg(lat, lon, subsolar));
      rgba.set(pixel, (y * width + x) * 4);
    }
  }
  return { width, height, rgba, subsolar };
}

/** Overlay strength for a camera height: full from orbit, gone at city scale. */
export function dayNightFade(heightM) {
  if (!Number.isFinite(heightM) || heightM >= DAY_NIGHT_FADE_M.high) return 1;
  if (heightM <= DAY_NIGHT_FADE_M.low) return 0;
  return (
    Math.log(heightM / DAY_NIGHT_FADE_M.low) /
    Math.log(DAY_NIGHT_FADE_M.high / DAY_NIGHT_FADE_M.low)
  );
}
