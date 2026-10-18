import { createMaidenheadGridLayer } from '../../layers/maidenhead/index.js';

/** Wire the computed Maidenhead locator grid into the application catalog. */
export function createApplicationMaidenheadGrid(options) {
  return createMaidenheadGridLayer(options);
}
