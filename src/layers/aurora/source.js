import { readResponseJsonCapped } from '../../sources/httpBody.js';
import { requestWithDeadline } from '../../sources/requestDeadline.js';
import { parseOvation } from './model.js';

// A portable export (package.json): no i18n here. Failures stay English data;
// the Layers panel shows them translated.
const msg = (text) => text;

/** NOAA SWPC, CORS `*`: read browser-direct. */
const OVATION_URL =
  'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
/** The full 1° grid is ~0.9 MB. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

/**
 * NOAA SWPC OVATION aurora nowcast.
 * @param {object} [options]
 * @param {Function} [options.fetchImpl] - Injected fetch, for tests.
 * @param {number} [options.timeoutMs=20000]
 * @returns {{getSnapshot: Function}}
 */
export function createOvationAuroraSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = 20_000,
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      const payload = await requestWithDeadline(
        async (deadline) => {
          const response = await fetchImpl(OVATION_URL, {
            headers: { Accept: 'application/json' },
            signal: deadline,
          });
          if (!response.ok) throw new Error(`SWPC HTTP ${response.status}`);
          return readResponseJsonCapped(response, MAX_RESPONSE_BYTES, deadline);
        },
        { signal, timeoutMs },
      );
      const snapshot = parseOvation(payload);
      if (!snapshot) throw new Error(msg('Malformed aurora response'));
      return snapshot;
    },
  };
}
