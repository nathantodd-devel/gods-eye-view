// A portable export (package.json): no i18n here. Labels stay English data;
// the Weather card translates them.
const msg = (text) => text;

/** Solar wind or X-ray readings older than this are no longer "now". */
export const SPACE_WEATHER_STALE_MS = 30 * 60 * 1000;
/** Kp history shown in the card: the last eight three-hour periods (24 h). */
const KP_TREND_LENGTH = 8;
const ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;
const ALERT_HEADLINE =
  /^(ALERT|WARNING|WATCH|EXTENDED WARNING|SUMMARY|CANCEL WARNING|CANCEL WATCH|CANCEL SUMMARY):\s*(.+)$/;

/** Rating order, worst first; band ratings step through it. */
export const BAND_RATINGS = Object.freeze(['poor', 'fair', 'good']);
export const BAND_RATING_COLORS = Object.freeze({
  good: '#3ecf6e',
  fair: '#e6c84a',
  poor: '#e2574c',
});
export const BAND_RATING_LABELS = Object.freeze({
  good: msg('Good'),
  fair: msg('Fair'),
  poor: msg('Poor'),
});

/**
 * Typical daytime and night-time openings by solar flux, as amateur
 * propagation summaries (N0NBH-style) estimate them. Thresholds are SFI.
 */
const BAND_GROUPS = Object.freeze([
  {
    band: '80m-40m',
    day: () => 'fair',
    night: () => 'good',
  },
  {
    band: '30m-20m',
    day: (sfi) => (sfi >= 80 ? 'good' : 'fair'),
    night: (sfi) => (sfi >= 120 ? 'good' : sfi >= 90 ? 'fair' : 'poor'),
  },
  {
    band: '17m-15m',
    day: (sfi) => (sfi >= 120 ? 'good' : sfi >= 90 ? 'fair' : 'poor'),
    night: (sfi) => (sfi >= 160 ? 'fair' : 'poor'),
  },
  {
    band: '12m-10m',
    day: (sfi) => (sfi >= 150 ? 'good' : sfi >= 110 ? 'fair' : 'poor'),
    night: (sfi) => (sfi >= 200 ? 'fair' : 'poor'),
  },
]);

const FLARE_CLASSES = Object.freeze([
  ['X', 1e-4],
  ['M', 1e-5],
  ['C', 1e-6],
  ['B', 1e-7],
  ['A', 1e-8],
]);

/** SWPC time tags are UTC, with or without a zone suffix. */
export function parseSwpcTime(tag) {
  if (typeof tag !== 'string' || !tag) return null;
  const iso = tag.trim().replace(' ', 'T');
  const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isFinite(ms) ? ms : null;
}

const finite = (value) => {
  const number = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(number) ? number : null;
};
const newestRow = (rows, valid) => {
  if (!Array.isArray(rows)) return null;
  let best = null;
  let bestMs = -Infinity;
  for (const row of rows) {
    const ms = parseSwpcTime(row?.time_tag);
    if (ms === null || ms <= bestMs || !valid(row)) continue;
    best = row;
    bestMs = ms;
  }
  return best ? { row: best, ms: bestMs } : null;
};

/**
 * GOES 0.1–0.8 nm flux as a flare class, e.g. 3.2e-6 → "C3.2".
 * @param {number} flux W/m²
 * @returns {string|null}
 */
export function flareClass(flux) {
  if (!Number.isFinite(flux) || flux <= 0) return null;
  const [letter, base] =
    FLARE_CLASSES.find(([, threshold]) => flux >= threshold) ||
    FLARE_CLASSES.at(-1);
  return `${letter}${(flux / base).toFixed(1)}`;
}

const downgrade = (rating, steps) =>
  BAND_RATINGS[Math.max(0, BAND_RATINGS.indexOf(rating) - steps)];

/**
 * Estimated HF conditions per band group. Geomagnetic storms (Kp ≥ 5, ≥ 7)
 * cost every band a step or two; M- and X-class flares black out the sunlit
 * side, so they cost only the daytime ratings.
 * @param {{ sfi: number|null, kp: number|null, xrayFlux: number|null }} conditions
 * @returns {Array<{ band: string, day: string, night: string }>|null} null without SFI
 */
export function estimateBandConditions({ sfi, kp, xrayFlux }) {
  if (!Number.isFinite(sfi)) return null;
  const storm = !Number.isFinite(kp) ? 0 : kp >= 7 ? 2 : kp >= 5 ? 1 : 0;
  const flare = !Number.isFinite(xrayFlux)
    ? 0
    : xrayFlux >= 1e-4
      ? 2
      : xrayFlux >= 1e-5
        ? 1
        : 0;
  return BAND_GROUPS.map(({ band, day, night }) => ({
    band,
    day: downgrade(day(sfi), storm + flare),
    night: downgrade(night(sfi), storm),
  }));
}

function newestAlert(alerts, now) {
  if (!Array.isArray(alerts)) return null;
  let best = null;
  for (const alert of alerts) {
    const issuedMs = parseSwpcTime(alert?.issue_datetime);
    if (issuedMs === null || now - issuedMs > ALERT_WINDOW_MS) continue;
    if (best && issuedMs <= best.issuedMs) continue;
    const headline = String(alert?.message || '')
      .split(/\r?\n/)
      .map((line) => line.trim().match(ALERT_HEADLINE))
      .find(Boolean);
    if (headline) best = { kind: headline[1], text: headline[2], issuedMs };
  }
  return best;
}

function currentScales(scales) {
  const today = scales?.['0'];
  if (!today || typeof today !== 'object') return null;
  const level = (entry) => {
    const value = finite(entry?.Scale);
    return value === null ? 0 : Math.max(0, Math.min(5, Math.round(value)));
  };
  return { R: level(today.R), S: level(today.S), G: level(today.G) };
}

/**
 * Normalize the SWPC payloads into one snapshot. Each part is independent: a
 * missing or malformed feed leaves its fields null rather than failing the
 * whole card.
 * @param {object} payloads Raw JSON keyed by feed (wind, mag, kp, kpNow, xray, flux, scales, alerts).
 * @param {number} [now=Date.now()]
 */
export function normalizeSpaceWeather(payloads = {}, now = Date.now()) {
  const wind = newestRow(
    payloads.wind,
    (row) => finite(row.proton_speed) !== null,
  );
  const mag = newestRow(payloads.mag, (row) => finite(row.bz_gsm) !== null);
  const kpNow = newestRow(
    payloads.kpNow,
    (row) => finite(row.estimated_kp) !== null,
  );
  const kpRows = Array.isArray(payloads.kp)
    ? payloads.kp
        .map((row) => ({
          ms: parseSwpcTime(row?.time_tag),
          kp: finite(row?.Kp),
        }))
        .filter(({ ms, kp }) => ms !== null && kp !== null)
        .sort((a, b) => a.ms - b.ms)
    : [];
  const xray = newestRow(
    payloads.xray,
    (row) => row.energy === '0.1-0.8nm' && finite(row.flux) !== null,
  );
  const flux = newestRow(payloads.flux, (row) => finite(row.flux) !== null);
  const kp = kpNow
    ? { value: finite(kpNow.row.estimated_kp), observedMs: kpNow.ms }
    : kpRows.length
      ? { value: kpRows.at(-1).kp, observedMs: kpRows.at(-1).ms }
      : null;
  const xrayFlux = xray ? finite(xray.row.flux) : null;
  const sfi = flux ? finite(flux.row.flux) : null;
  const snapshot = {
    solarWind: wind
      ? { speedKms: finite(wind.row.proton_speed), observedMs: wind.ms }
      : null,
    magneticField: mag
      ? {
          btNt: finite(mag.row.bt),
          bzNt: finite(mag.row.bz_gsm),
          observedMs: mag.ms,
        }
      : null,
    kp,
    kpTrend: kpRows.slice(-KP_TREND_LENGTH).map(({ ms, kp: value }) => ({
      observedMs: ms,
      kp: value,
    })),
    xray: xray
      ? {
          flux: xrayFlux,
          flareClass: flareClass(xrayFlux),
          observedMs: xray.ms,
        }
      : null,
    sfi: flux ? { value: sfi, observedMs: flux.ms } : null,
    scales: currentScales(payloads.scales),
    alert: newestAlert(payloads.alerts, now),
    bands: estimateBandConditions({ sfi, kp: kp?.value ?? null, xrayFlux }),
  };
  const realtime = [snapshot.solarWind, snapshot.magneticField, snapshot.xray]
    .map((part) => part?.observedMs)
    .filter(Number.isFinite);
  snapshot.observedMs = realtime.length ? Math.max(...realtime) : null;
  snapshot.stale =
    snapshot.observedMs === null ||
    now - snapshot.observedMs > SPACE_WEATHER_STALE_MS;
  snapshot.empty =
    !snapshot.solarWind &&
    !snapshot.magneticField &&
    !snapshot.kp &&
    !snapshot.xray &&
    !snapshot.sfi;
  return snapshot;
}
