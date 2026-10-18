import { createSpaceWeatherLayer } from '../../layers/spaceWeather/index.js';

/** Wire the NOAA SWPC space-weather readout into the application catalog. */
export function createApplicationSpaceWeather(options) {
  return createSpaceWeatherLayer(options);
}
