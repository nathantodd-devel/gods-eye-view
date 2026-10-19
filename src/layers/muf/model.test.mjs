import test from 'node:test';
import assert from 'node:assert/strict';
import { bandForMhz, parseMufContours } from './model.js';

const feature = (mhz, coordinates, stroke = '#038637') => ({
  type: 'Feature',
  properties: { 'level-value': mhz, stroke, title: `${mhz} ` },
  geometry: { type: 'LineString', coordinates },
});

test('contour frequencies name the amateur band they open', () => {
  assert.equal(bandForMhz(10.1), '30m');
  assert.equal(bandForMhz(14), '20m');
  assert.equal(bandForMhz(24.8), '12m');
  assert.equal(bandForMhz(28), '10m');
  assert.equal(bandForMhz(16), null);
});

test('contours become lines and sorted legend levels', () => {
  const parsed = parseMufContours({
    type: 'FeatureCollection',
    features: [
      feature(18, [
        [0, 10],
        [10, 20],
        [20, 10],
      ]),
      feature(
        14,
        [
          [-10, 0],
          [-20, 5],
        ],
        'not-a-colour',
      ),
    ],
  });
  assert.equal(parsed.lines.length, 2);
  assert.deepEqual(
    parsed.levels.map(({ mhz, band }) => [mhz, band]),
    [
      [14, '20m'],
      [18, '17m'],
    ],
  );
  assert.equal(parsed.lines[1].color, '#7fd4ff', 'bad colours fall back');
});

test('contours are cut where they pass 85°, which stops the renderer', () => {
  const parsed = parseMufContours({
    features: [
      feature(14, [
        [0, 80],
        [10, 84],
        [20, 88.3],
        [30, 84],
        [40, 80],
      ]),
      feature(14, [
        [0, -88],
        [10, -87],
      ]),
    ],
  });
  assert.equal(parsed.lines.length, 2);
  for (const { points } of parsed.lines) {
    assert.equal(points.length, 2);
    assert.ok(points.every(([, lat]) => Math.abs(lat) <= 85));
  }
  assert.equal(parseMufContours({}), null);
});
