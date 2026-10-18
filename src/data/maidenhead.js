/**
 * Maidenhead locator (QTH grid) arithmetic. A locator pairs a field (A–R,
 * 20° × 10°), a square (0–9, 2° × 1°) and optionally a subsquare (a–x,
 * 5′ × 2.5′): "FN31pr" is field FN, square 31, subsquare pr.
 */

const FIELD = 'ABCDEFGHIJKLMNOPQR';
const SUBSQUARE = 'abcdefghijklmnopqrstuvwx';
const LOCATOR = /^[A-R]{2}(?:[0-9]{2}(?:[a-x]{2})?)?$/;

/** Field and square spans in degrees, longitude then latitude. */
export const MAIDENHEAD_FIELD_DEG = Object.freeze({ lon: 20, lat: 10 });
export const MAIDENHEAD_SQUARE_DEG = Object.freeze({ lon: 2, lat: 1 });
const SUBSQUARE_DEG = Object.freeze({ lon: 2 / 24, lat: 1 / 24 });

/**
 * Canonical case ("fn31PR" → "FN31pr"), or null for anything that is not a
 * 2-, 4- or 6-character locator.
 * @param {string} text
 * @returns {string|null}
 */
export function normalizeMaidenhead(text) {
  const raw = String(text ?? '').trim();
  if (![2, 4, 6].includes(raw.length)) return null;
  const locator =
    raw.slice(0, 2).toUpperCase() +
    raw.slice(2, 4) +
    raw.slice(4).toLowerCase();
  return LOCATOR.test(locator) ? locator : null;
}

/**
 * Locator containing a point. Latitude 90 and longitude 180 fold into the
 * last cell rather than running off the grid.
 * @param {number} latDeg
 * @param {number} lonDeg
 * @param {2|4|6} [length=6]
 * @returns {string|null}
 */
export function encodeMaidenhead(latDeg, lonDeg, length = 6) {
  if (!Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) return null;
  if (Math.abs(latDeg) > 90) return null;
  if (![2, 4, 6].includes(length)) return null;
  const lon = Math.min(359.999999, (((lonDeg + 180) % 360) + 360) % 360);
  const lat = Math.min(179.999999, latDeg + 90);
  let locator =
    FIELD[Math.floor(lon / MAIDENHEAD_FIELD_DEG.lon)] +
    FIELD[Math.floor(lat / MAIDENHEAD_FIELD_DEG.lat)];
  if (length >= 4)
    locator +=
      String(Math.floor((lon % MAIDENHEAD_FIELD_DEG.lon) / 2)) +
      String(Math.floor(lat % MAIDENHEAD_FIELD_DEG.lat));
  if (length === 6)
    locator +=
      SUBSQUARE[Math.floor((lon % 2) / SUBSQUARE_DEG.lon)] +
      SUBSQUARE[Math.floor((lat % 1) / SUBSQUARE_DEG.lat)];
  return locator;
}

/**
 * Bounds and centre of a locator, in degrees, or null when it is invalid.
 * @param {string} text
 * @returns {{ west: number, south: number, east: number, north: number, latDeg: number, lonDeg: number }|null}
 */
export function decodeMaidenhead(text) {
  const locator = normalizeMaidenhead(text);
  if (!locator) return null;
  let west = FIELD.indexOf(locator[0]) * MAIDENHEAD_FIELD_DEG.lon - 180;
  let south = FIELD.indexOf(locator[1]) * MAIDENHEAD_FIELD_DEG.lat - 90;
  let span = MAIDENHEAD_FIELD_DEG;
  if (locator.length >= 4) {
    west += Number(locator[2]) * MAIDENHEAD_SQUARE_DEG.lon;
    south += Number(locator[3]) * MAIDENHEAD_SQUARE_DEG.lat;
    span = MAIDENHEAD_SQUARE_DEG;
  }
  if (locator.length === 6) {
    west += SUBSQUARE.indexOf(locator[4]) * SUBSQUARE_DEG.lon;
    south += SUBSQUARE.indexOf(locator[5]) * SUBSQUARE_DEG.lat;
    span = SUBSQUARE_DEG;
  }
  return {
    west,
    south,
    east: west + span.lon,
    north: south + span.lat,
    latDeg: south + span.lat / 2,
    lonDeg: west + span.lon / 2,
  };
}
