import { readResponseJsonCapped } from '../../sources/httpBody.js';
import { requestWithDeadline } from '../../sources/requestDeadline.js';
import { parseMufContours } from './model.js';

// A portable export (package.json): no i18n here. Failures stay English data;
// the Layers panel shows them translated.
const msg = (text) => text;

/** KC2G's current render, CORS `*`: read browser-direct. */
const MUF_URL = 'https://prop.kc2g.com/renders/current/mufd-normal-now.geojson';
/** The contour set is ~100 KB. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

/**
 * KC2G's ionosonde-derived MUF(3000) contours. The GeoJSON carries no
 * timestamp, so the response's Last-Modified stands in for the map time.
 * @param {object} [options]
 * @param {Function} [options.fetchImpl] - Injected fetch, for tests.
 * @param {() => number} [options.now] - Clock seam, for tests.
 * @param {number} [options.timeoutMs=15000]
 * @returns {{getSnapshot: Function}}
 */
export function createKc2gMufSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  timeoutMs = 15_000,
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      const { payload, modified } = await requestWithDeadline(
        async (deadline) => {
          const response = await fetchImpl(MUF_URL, {
            headers: { Accept: 'application/geo+json, application/json' },
            signal: deadline,
          });
          if (!response.ok) throw new Error(`KC2G HTTP ${response.status}`);
          return {
            payload: await readResponseJsonCapped(
              response,
              MAX_RESPONSE_BYTES,
              deadline,
            ),
            modified: Date.parse(response.headers.get('last-modified') || ''),
          };
        },
        { signal, timeoutMs },
      );
      const contours = parseMufContours(payload);
      if (!contours) throw new Error(msg('Malformed MUF response'));
      return {
        ...contours,
        renderedMs: Number.isFinite(modified) ? modified : now(),
      };
    },
  };
}
