import { readResponseTextCapped } from '../../sources/httpBody.js';
import { requestWithDeadline } from '../../sources/requestDeadline.js';
import { parseDrap } from './model.js';

// A portable export (package.json): no i18n here. Failures stay English data;
// the Layers panel shows them translated.
const msg = (text) => text;

/** NOAA SWPC, CORS `*`: read browser-direct. */
const DRAP_URL =
  'https://services.swpc.noaa.gov/text/drap_global_frequencies.txt';
/** The table is ~42 KB. */
const MAX_RESPONSE_BYTES = 1024 * 1024;

/**
 * NOAA SWPC D-Region Absorption Prediction global frequency table.
 * @param {object} [options]
 * @param {Function} [options.fetchImpl] - Injected fetch, for tests.
 * @param {number} [options.timeoutMs=15000]
 * @returns {{getSnapshot: Function}}
 */
export function createSwpcDrapSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = 15_000,
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      const text = await requestWithDeadline(
        async (deadline) => {
          const response = await fetchImpl(DRAP_URL, { signal: deadline });
          if (!response.ok) throw new Error(`SWPC HTTP ${response.status}`);
          return readResponseTextCapped(response, MAX_RESPONSE_BYTES, deadline);
        },
        { signal, timeoutMs },
      );
      const snapshot = parseDrap(text);
      if (!snapshot) throw new Error(msg('Malformed D-RAP response'));
      return snapshot;
    },
  };
}
