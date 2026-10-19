import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AURORA_MIN_PERCENT,
  auroraPixel,
  createAuroraRaster,
  parseOvation,
} from './model.js';

const OVATION = {
  'Observation Time': '2026-10-18T22:28:00Z',
  'Forecast Time': '2026-10-18T23:34:00Z',
  'Data Format': '[Longitude, Latitude, Aurora]',
  coordinates: [
    [0, -90, 1],
    [250, 65, 40],
    [250, 66, 80],
    [10, 60, 5],
    ['bad', 1, 2],
  ],
};

test('OVATION parses into a probability grid with its times and peak', () => {
  const snapshot = parseOvation(OVATION);
  assert.equal(snapshot.observedMs, Date.parse('2026-10-18T22:28:00Z'));
  assert.equal(snapshot.forecastMs, Date.parse('2026-10-18T23:34:00Z'));
  assert.equal(snapshot.peakPercent, 80);
  assert.equal(snapshot.cells, 2, 'cells at or above the drawing floor');
  assert.equal(parseOvation({ coordinates: [] }), null);
  assert.equal(parseOvation(null), null);
});

test('the ramp is clear below the floor and red at high probability', () => {
  assert.deepEqual(auroraPixel(AURORA_MIN_PERCENT - 1), [0, 0, 0, 0]);
  const low = auroraPixel(AURORA_MIN_PERCENT);
  const high = auroraPixel(90);
  assert.ok(low[1] > low[0], 'low probability is green');
  assert.ok(high[0] > high[1], 'high probability is red');
  assert.ok(high[3] > low[3]);
});

test('the raster places 110°W, 65.5°N where the oval is', () => {
  const raster = createAuroraRaster(parseOvation(OVATION));
  assert.equal(raster.width, 360);
  assert.equal(raster.height, 180);
  // Cell (110°W–109°W, 66°N–65°N): column 70, row 24.
  const alpha = (x, y) => raster.rgba[(y * 360 + x) * 4 + 3];
  assert.ok(alpha(70, 24) > 0, 'OVATION lon 250 is 110°W');
  assert.equal(alpha(250, 24), 0, 'nothing at 70°E');
});
