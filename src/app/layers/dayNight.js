import { createDayNightLayer } from '../../layers/dayNight/index.js';

/** Wire the computed day/night and gray-line overlay into the application catalog. */
export function createApplicationDayNight(options) {
  return createDayNightLayer(options);
}
