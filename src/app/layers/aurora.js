import { createAuroraLayer } from '../../layers/aurora/index.js';

/** Wire the NOAA SWPC OVATION aurora oval into the application catalog. */
export function createApplicationAurora(options) {
  return createAuroraLayer(options);
}
