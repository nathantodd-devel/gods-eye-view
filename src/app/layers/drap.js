import { createDrapLayer } from '../../layers/drap/index.js';

/** Wire the NOAA SWPC D-region absorption overlay into the application catalog. */
export function createApplicationDrap(options) {
  return createDrapLayer(options);
}
