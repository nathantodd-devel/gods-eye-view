import { createUsgsEarthquakeSource } from '../layers/earthquakes/source.js';
import { createEcccAirQualitySource } from '../layers/airQuality/source.js';
import { createWfigsPerimeterSource } from '../layers/perimeters/source.js';
import { createBundledCableSource } from '../layers/submarineCables/bundledSource.js';
import { createAdsbGnssSource } from '../layers/gnss/source.js';
import { createSwpcSpaceWeatherSource } from '../layers/spaceWeather/source.js';
import { createOvationAuroraSource } from '../layers/aurora/source.js';
import { createSwpcDrapSource } from '../layers/drap/source.js';
import { createKc2gMufSource } from '../layers/muf/source.js';

/** Construct the existing reference feeds independently of application setup. */
export function createReferenceSources() {
  return {
    earthquakes: createUsgsEarthquakeSource(),
    'air-quality': createEcccAirQualitySource(),
    'fire-perimeters': createWfigsPerimeterSource(),
    cables: createBundledCableSource(),
    'gnss-integrity': createAdsbGnssSource(),
    'space-weather': createSwpcSpaceWeatherSource(),
    aurora: createOvationAuroraSource(),
    drap: createSwpcDrapSource(),
    muf: createKc2gMufSource(),
  };
}
