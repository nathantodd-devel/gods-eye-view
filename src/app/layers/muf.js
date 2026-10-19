import { createMufLayer } from '../../layers/muf/index.js';

/** Wire the KC2G MUF(3000) contour map into the application catalog. */
export function createApplicationMuf(options) {
  return createMufLayer(options);
}
