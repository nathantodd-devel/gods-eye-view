import {
  MAIDENHEAD_FIELD_DEG,
  MAIDENHEAD_SQUARE_DEG,
} from '../../data/maidenhead.js';

/** Squares (2° × 1°) are drawn once the camera is below this height (m). */
export const MAIDENHEAD_SQUARE_HEIGHT_M = 2_000_000;
/** Ground polylines cap: a wide square-level view falls back to fields. */
const MAX_SQUARE_LINES = 160;
/**
 * Lines stop at 85°, the flat Mercator map's edge too. Cesium's ground
 * polyline worker produces a NaN direction for a meridian reaching 87° or
 * more, and the renderer stops on it.
 */
const POLE_LIMIT_DEG = 85;

const range = (start, stop, step) => {
  const out = [];
  for (let value = start; value <= stop + 1e-9; value += step) out.push(value);
  return out;
};
const snapDown = (value, step, origin) =>
  origin + Math.floor((value - origin) / step) * step;
const snapUp = (value, step, origin) =>
  origin + Math.ceil((value - origin) / step) * step;

/**
 * Grid lines for the current view. Meridians run pole to pole (geodesic);
 * parallels follow their latitude (rhumb). Without a view rectangle, or
 * zoomed out, only field lines are drawn.
 * @param {{ west: number, south: number, east: number, north: number }|null} view Degrees
 * @param {number} heightM Camera height
 * @returns {{ level: 'field'|'square', lines: Array<{ id: string, kind: 'meridian'|'parallel', major: boolean, points: Array<[number, number]> }> }}
 */
export function maidenheadGridLines(view, heightM) {
  const square =
    view && Number.isFinite(heightM) && heightM < MAIDENHEAD_SQUARE_HEIGHT_M;
  if (square) {
    const lines = squareLines(view);
    if (lines) return { level: 'square', lines };
  }
  return { level: 'field', lines: fieldLines() };
}

function fieldLines() {
  const { lon: lonStep, lat: latStep } = MAIDENHEAD_FIELD_DEG;
  const meridians = range(-180, 180 - lonStep, lonStep).map((lon) => ({
    id: `field-lon:${lon}`,
    kind: 'meridian',
    major: true,
    points: [-POLE_LIMIT_DEG, -60, -30, 0, 30, 60, POLE_LIMIT_DEG].map(
      (lat) => [lon, lat],
    ),
  }));
  const parallels = range(-90 + latStep, 90 - latStep, latStep).map((lat) => ({
    id: `field-lat:${lat}`,
    kind: 'parallel',
    major: true,
    points: range(-180, 180, 60).map((lon) => [lon, lat]),
  }));
  return [...meridians, ...parallels];
}

function squareLines(view) {
  const { lon: lonStep, lat: latStep } = MAIDENHEAD_SQUARE_DEG;
  // A view across the antimeridian has east < west; unwrap it.
  const east = view.east < view.west ? view.east + 360 : view.east;
  const west = snapDown(view.west, lonStep, -180);
  const eastEdge = snapUp(east, lonStep, -180);
  const south = Math.max(-POLE_LIMIT_DEG, snapDown(view.south, latStep, -90));
  const north = Math.min(POLE_LIMIT_DEG, snapUp(view.north, latStep, -90));
  const lons = range(west, eastEdge, lonStep);
  const lats = range(south, north, latStep);
  if (lons.length + lats.length > MAX_SQUARE_LINES) return null;
  const wrap = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;
  const isField = (value, step, origin) =>
    Math.abs((((value - origin) % step) + step) % step) < 1e-9;
  const meridians = lons.map((lon) => ({
    id: `square-lon:${wrap(lon)}`,
    kind: 'meridian',
    major: isField(lon, MAIDENHEAD_FIELD_DEG.lon, -180),
    points: [
      [lon, south],
      [lon, north],
    ],
  }));
  const parallels = lats
    .filter((lat) => lat > -90 && lat < 90)
    .map((lat) => ({
      id: `square-lat:${lat}`,
      kind: 'parallel',
      major: isField(lat, MAIDENHEAD_FIELD_DEG.lat, -90),
      // Unwrapped longitudes (past 180) keep a line across the antimeridian
      // short; positions from degrees accept them.
      points: range(
        west,
        eastEdge,
        Math.max(lonStep, (eastEdge - west) / 8),
      ).map((lon) => [lon, lat]),
    }));
  return [...meridians, ...parallels];
}
