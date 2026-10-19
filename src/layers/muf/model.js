// A portable export (package.json): no i18n here. Labels stay English data;
// the Layers panel translates them.
const msg = (text) => text;

/** KC2G re-renders every 15 minutes; an hour without a new map is stale. */
export const MUF_STALE_MS = 60 * 60 * 1000;
/**
 * Ground polylines past 85° stop Cesium's renderer (see the Maidenhead grid),
 * so contours are cut where they leave that band.
 */
const POLE_LIMIT_DEG = 85;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const FALLBACK_COLOR = '#7fd4ff';

/** KC2G draws its MUF(3000) contours at the amateur band frequencies. */
const BANDS = Object.freeze([
  [10.1, '30m'],
  [14, '20m'],
  [18, '17m'],
  [21, '15m'],
  [24.8, '12m'],
  [28, '10m'],
]);

/** The band a contour frequency (MHz) opens, or null between bands. */
export function bandForMhz(mhz) {
  return BANDS.find(([edge]) => Math.abs(edge - mhz) < 0.15)?.[1] ?? null;
}

export const MUF_LABEL = msg('{band} · {mhz} MHz');
export const MUF_LABEL_NO_BAND = msg('{mhz} MHz');

/** Split a line into runs that stay within ±85°. */
function clipToPoleLimit(points) {
  const runs = [];
  let run = [];
  for (const point of points) {
    if (Math.abs(point[1]) <= POLE_LIMIT_DEG) run.push(point);
    else {
      if (run.length > 1) runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

const validPoint = (point) =>
  Array.isArray(point) &&
  Number.isFinite(point[0]) &&
  Number.isFinite(point[1]) &&
  Math.abs(point[0]) <= 180 &&
  Math.abs(point[1]) <= 90;

/**
 * KC2G MUF(3000) contour GeoJSON as drawable lines, one entry per run, and
 * the distinct levels for the legend (lowest first).
 * @param {object} geojson `renders/current/mufd-normal-now.geojson`
 * @returns {{ lines: Array<{ id: string, mhz: number, band: string|null, color: string, points: Array<[number, number]> }>, levels: Array<{ mhz: number, band: string|null, color: string }> }|null}
 */
export function parseMufContours(geojson) {
  if (!Array.isArray(geojson?.features)) return null;
  const lines = [];
  const levels = new Map();
  geojson.features.forEach((feature, featureIndex) => {
    const mhz = Number(feature?.properties?.['level-value']);
    if (!Number.isFinite(mhz)) return;
    const stroke = feature.properties.stroke;
    const color = HEX_COLOR.test(stroke) ? stroke : FALLBACK_COLOR;
    const geometry = feature.geometry;
    const parts =
      geometry?.type === 'LineString'
        ? [geometry.coordinates]
        : geometry?.type === 'MultiLineString'
          ? geometry.coordinates
          : [];
    parts.forEach((part, partIndex) => {
      if (!Array.isArray(part)) return;
      const points = part.filter(validPoint).map(([lon, lat]) => [lon, lat]);
      clipToPoleLimit(points).forEach((run, runIndex) =>
        lines.push({
          id: `${featureIndex}:${partIndex}:${runIndex}`,
          mhz,
          band: bandForMhz(mhz),
          color,
          points: run,
        }),
      );
    });
    if (!levels.has(mhz))
      levels.set(mhz, { mhz, band: bandForMhz(mhz), color });
  });
  return {
    lines,
    levels: [...levels.values()].sort((a, b) => a.mhz - b.mhz),
  };
}
