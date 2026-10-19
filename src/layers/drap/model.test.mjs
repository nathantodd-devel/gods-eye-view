import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrapRaster, drapPixel, parseDrap } from './model.js';

const lons = Array.from({ length: 12 }, (_, i) => -165 + i * 30);
const row = (lat, values) =>
  ` ${lat} | ${values.map((v) => v.toFixed(1).padStart(4)).join(' ')}`;
const DRAP = [
  '# DRAP Tabular Values',
  '# Product Valid At : 2026-10-18 22:37 UTC',
  '#',
  '#  X-RAY Message : Normal X-ray Background',
  '#  Proton Message : Normal Proton Background',
  '# Frequency (MHz) as a function of Latitude and Longitude',
  '#',
  `      ${lons.map((lon) => String(lon).padStart(4)).join(' ')}`,
  '-'.repeat(80),
  row(45, Array(12).fill(0)),
  row(0, [0, 0, 0, 0, 2.4, 3.1, 0, 0, 0, 0, 0, 0]),
  row(-45, Array(12).fill(0.2)),
].join('\n');

test('the D-RAP table parses rows, columns, header and peak', () => {
  const snapshot = parseDrap(DRAP);
  assert.deepEqual(snapshot.lats, [45, 0, -45]);
  assert.deepEqual(snapshot.lons, lons);
  assert.equal(snapshot.maxMhz, 3.1);
  assert.equal(snapshot.cells, 2);
  assert.equal(snapshot.validMs, Date.parse('2026-10-18T22:37:00Z'));
  assert.equal(snapshot.xrayMessage, 'Normal X-ray Background');
  assert.equal(snapshot.protonMessage, 'Normal Proton Background');
});

test('a ragged or empty table is rejected', () => {
  assert.equal(parseDrap(DRAP.replace(' 3.1', '')), null);
  assert.equal(parseDrap('# nothing here'), null);
  assert.equal(parseDrap(undefined), null);
});

test('one pixel per cell, clear where nothing is absorbed', () => {
  const raster = createDrapRaster(parseDrap(DRAP));
  assert.equal(raster.width, 12);
  assert.equal(raster.height, 3);
  const alpha = (x, y) => raster.rgba[(y * 12 + x) * 4 + 3];
  assert.equal(alpha(0, 0), 0);
  assert.ok(alpha(5, 1) > 0);
  assert.equal(alpha(0, 2), 0, '0.2 MHz is below the floor');
  assert.ok(drapPixel(35)[0] > drapPixel(35)[2], 'blackout is red');
});
