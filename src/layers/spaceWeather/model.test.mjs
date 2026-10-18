import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateBandConditions,
  flareClass,
  normalizeSpaceWeather,
  parseSwpcTime,
} from './model.js';
import { SWPC_FIXTURE } from './testFixture.mjs';

const NOW = Date.parse('2026-10-18T22:00:00Z');

test('SWPC time tags are UTC with or without a zone', () => {
  assert.equal(
    parseSwpcTime('2026-10-18T20:00:00'),
    Date.parse('2026-10-18T20:00:00Z'),
  );
  assert.equal(
    parseSwpcTime('2026-10-18 17:24:58.920'),
    Date.parse('2026-10-18T17:24:58.920Z'),
  );
  assert.equal(parseSwpcTime('nonsense'), null);
  assert.equal(parseSwpcTime(undefined), null);
});

test('GOES long-wave flux reads as a flare class', () => {
  assert.equal(flareClass(3.2e-6), 'C3.2');
  assert.equal(flareClass(1e-5), 'M1.0');
  assert.equal(flareClass(2.4e-4), 'X2.4');
  assert.equal(flareClass(5e-8), 'A5.0');
  assert.equal(flareClass(0), null);
});

test('band ratings follow solar flux, storms cost every band, flares only the day side', () => {
  const quiet = estimateBandConditions({ sfi: 137, kp: 1.7, xrayFlux: 3e-6 });
  assert.deepEqual(quiet, [
    { band: '80m-40m', day: 'fair', night: 'good' },
    { band: '30m-20m', day: 'good', night: 'good' },
    { band: '17m-15m', day: 'good', night: 'poor' },
    { band: '12m-10m', day: 'fair', night: 'poor' },
  ]);
  const storm = estimateBandConditions({ sfi: 137, kp: 5.3, xrayFlux: 3e-6 });
  assert.equal(storm[1].day, 'fair');
  assert.equal(storm[0].night, 'fair');
  const flare = estimateBandConditions({ sfi: 137, kp: 1, xrayFlux: 2e-4 });
  assert.equal(flare[1].day, 'poor');
  assert.equal(flare[1].night, 'good', 'a flare spares the night side');
  assert.equal(estimateBandConditions({ sfi: null, kp: 1 }), null);
});

test('the snapshot takes the newest reading of each feed', () => {
  const snapshot = normalizeSpaceWeather(SWPC_FIXTURE, NOW);
  assert.equal(snapshot.solarWind.speedKms, 419);
  assert.equal(snapshot.magneticField.bzNt, -2);
  assert.equal(snapshot.kp.value, 1.67);
  assert.equal(snapshot.xray.flareClass, 'C3.2');
  assert.equal(snapshot.sfi.value, 137);
  assert.deepEqual(snapshot.scales, { R: 0, S: 0, G: 1 });
  assert.deepEqual(
    snapshot.kpTrend.map(({ kp }) => kp),
    [2.33, 3.0, 2.67],
  );
  assert.equal(snapshot.bands.length, 4);
  assert.equal(snapshot.stale, false);
  assert.equal(snapshot.empty, false);
});

test('only an alert from the last 24 h is shown, as its headline', () => {
  const { alert } = normalizeSpaceWeather(SWPC_FIXTURE, NOW);
  assert.equal(alert.kind, 'WATCH');
  assert.equal(alert.text, 'Geomagnetic Storm Category G1 Predicted');
  const later = normalizeSpaceWeather(
    SWPC_FIXTURE,
    NOW + 2 * 24 * 60 * 60 * 1000,
  );
  assert.equal(later.alert, null);
});

test('missing feeds leave their readings null; old readings are stale', () => {
  const partial = normalizeSpaceWeather({ flux: SWPC_FIXTURE.flux }, NOW);
  assert.equal(partial.solarWind, null);
  assert.equal(partial.xray, null);
  assert.equal(partial.sfi.value, 137);
  assert.equal(partial.stale, true, 'no real-time reading');
  assert.equal(partial.empty, false);
  assert.equal(normalizeSpaceWeather({ wind: 'garbage' }, NOW).empty, true);
  const hourLater = normalizeSpaceWeather(SWPC_FIXTURE, NOW + 60 * 60 * 1000);
  assert.equal(hourLater.stale, true);
});
