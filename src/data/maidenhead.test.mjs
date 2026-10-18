import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeMaidenhead,
  encodeMaidenhead,
  normalizeMaidenhead,
} from './maidenhead.js';

test('ARRL headquarters (W1AW, Newington CT) is FN31pr', () => {
  assert.equal(encodeMaidenhead(41.714775, -72.72726), 'FN31pr');
  assert.equal(encodeMaidenhead(41.714775, -72.72726, 4), 'FN31');
  assert.equal(encodeMaidenhead(41.714775, -72.72726, 2), 'FN');
});

test('a decoded locator contains the point it was encoded from', () => {
  for (const [lat, lon] of [
    [41.714775, -72.72726],
    [-33.8688, 151.2093],
    [64.1466, -21.9426],
    [-54.8019, -68.303],
    [0, 0],
  ]) {
    const cell = decodeMaidenhead(encodeMaidenhead(lat, lon));
    assert.ok(lat >= cell.south && lat < cell.north, `${lat} in cell`);
    assert.ok(lon >= cell.west && lon < cell.east, `${lon} in cell`);
  }
});

test('decoding returns the cell bounds and centre at each precision', () => {
  assert.deepEqual(decodeMaidenhead('FN'), {
    west: -80,
    south: 40,
    east: -60,
    north: 50,
    latDeg: 45,
    lonDeg: -70,
  });
  const square = decodeMaidenhead('FN31');
  assert.equal(square.west, -74);
  assert.equal(square.south, 41);
  assert.equal(square.east - square.west, 2);
  assert.equal(square.north - square.south, 1);
  const sub = decodeMaidenhead('FN31pr');
  assert.ok(Math.abs(sub.east - sub.west - 2 / 24) < 1e-12);
});

test('locators normalize case and reject malformed text', () => {
  assert.equal(normalizeMaidenhead(' fn31PR '), 'FN31pr');
  for (const bad of ['', 'F', 'FN3', 'SN31', 'FN31py', 'FN31prx', '12AB'])
    assert.equal(normalizeMaidenhead(bad), null, bad);
  assert.equal(decodeMaidenhead('ZZ'), null);
});

test('the grid edges fold into the last cell instead of running off it', () => {
  assert.equal(encodeMaidenhead(90, 179.99999), 'RR99xx');
  // 180° and -180° are one meridian, at the western edge of field A.
  assert.equal(encodeMaidenhead(0, 180), encodeMaidenhead(0, -180));
  assert.equal(encodeMaidenhead(-90, -180), 'AA00aa');
  assert.equal(encodeMaidenhead(91, 0), null);
  assert.equal(encodeMaidenhead(Number.NaN, 0), null);
});
