import { readResponseJsonCapped } from '../../sources/httpBody.js';
import { normalizeSpaceWeather } from './model.js';

// A portable export (package.json): no i18n here. Failures stay English data;
// the Layers panel and the Weather card show them translated.
const msg = (text) => text;

const SWPC_ROOT = 'https://services.swpc.noaa.gov';
/**
 * SWPC sends `Access-Control-Allow-Origin: *`, so the browser reads it
 * directly. Each feed refetches on its own cadence: the one-minute products
 * every update, the slow ones far less often.
 */
export const SPACE_WEATHER_FEEDS = Object.freeze({
  wind: { path: '/products/summary/solar-wind-speed.json', ttlMs: 60_000 },
  mag: { path: '/products/summary/solar-wind-mag-field.json', ttlMs: 60_000 },
  kpNow: { path: '/json/planetary_k_index_1m.json', ttlMs: 60_000 },
  xray: { path: '/json/goes/primary/xrays-6-hour.json', ttlMs: 60_000 },
  kp: { path: '/products/noaa-planetary-k-index.json', ttlMs: 15 * 60_000 },
  scales: { path: '/products/noaa-scales.json', ttlMs: 5 * 60_000 },
  alerts: { path: '/products/alerts.json', ttlMs: 5 * 60_000 },
  flux: { path: '/products/summary/10cm-flux.json', ttlMs: 60 * 60_000 },
});
/** The six-hour X-ray series is the largest at ~160 KB. */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * NOAA SWPC space-weather snapshot. A feed that fails keeps its last good
 * payload, so one outage degrades a single reading instead of the card; the
 * snapshot fails only when no feed has ever answered.
 * @param {object} [options]
 * @param {Function} [options.fetchImpl] - Injected fetch, for tests.
 * @param {() => number} [options.now] - Clock seam, for tests.
 * @param {number} [options.timeoutMs=15000] - Deadline for each request.
 * @returns {{getSnapshot: Function}}
 */
export function createSwpcSpaceWeatherSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  timeoutMs = 15_000,
} = {}) {
  /** @type {Map<string, { payload: unknown, fetchedAt: number }>} */
  const cache = new Map();

  const getJson = async (url, signal) => {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new Error(msg('SWPC request timed out'))),
      timeoutMs,
    );
    try {
      signal?.throwIfAborted();
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`SWPC HTTP ${response.status}`);
      return await readResponseJsonCapped(
        response,
        MAX_RESPONSE_BYTES,
        controller.signal,
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };

  return {
    async getSnapshot({ signal } = {}) {
      const clock = now();
      const due = Object.entries(SPACE_WEATHER_FEEDS).filter(
        ([id, { ttlMs }]) => {
          const entry = cache.get(id);
          return !entry || clock - entry.fetchedAt >= ttlMs;
        },
      );
      const results = await Promise.allSettled(
        due.map(([, { path }]) => getJson(`${SWPC_ROOT}${path}`, signal)),
      );
      signal?.throwIfAborted();
      let firstError = null;
      due.forEach(([id], index) => {
        const result = results[index];
        if (result.status === 'fulfilled')
          cache.set(id, { payload: result.value, fetchedAt: clock });
        else firstError ??= result.reason;
      });
      if (cache.size === 0)
        throw firstError instanceof Error
          ? firstError
          : new Error(msg('Space weather request failed'));
      const payloads = Object.fromEntries(
        [...cache].map(([id, { payload }]) => [id, payload]),
      );
      const snapshot = normalizeSpaceWeather(payloads, clock);
      if (snapshot.empty)
        throw new Error(msg('Malformed space weather response'));
      return snapshot;
    },
  };
}
