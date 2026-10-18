import test from 'node:test';
import assert from 'node:assert/strict';
import { subsolarPoint } from '../../data/satellitePass.js';
import {
  DAY_NIGHT_FADE_M,
  createDayNightRaster,
  dayNightFade,
  dayNightPixel,
  solarElevationDeg,
} from './model.js';

test('the subsolar point follows the season and the clock', () => {
  // March equinox 2026 (20 Mar 14:46 UTC): the Sun crosses the equator.
  const equinox = subsolarPoint(Date.parse('2026-03-20T14:46:00Z'));
  assert.ok(Math.abs(equinox.latDeg) < 0.1, `lat ${equinox.latDeg}`);
  // June solstice: over the Tropic of Cancer.
  const solstice = subsolarPoint(Date.parse('2026-06-21T12:00:00Z'));
  assert.ok(Math.abs(solstice.latDeg - 23.44) < 0.1, `lat ${solstice.latDeg}`);
  // Solar noon at Greenwich is within the equation of time (< 4.5°) of 12:00.
  assert.ok(Math.abs(solstice.lonDeg) < 4.5, `lon ${solstice.lonDeg}`);
  const sixHoursLater = subsolarPoint(Date.parse('2026-06-21T18:00:00Z'));
  assert.ok(Math.abs(sixHoursLater.lonDeg - (solstice.lonDeg - 90)) < 0.5);
});

test('the Sun is overhead at the subsolar point and set at its antipode', () => {
  const subsolar = { latDeg: 10, lonDeg: 40 };
  assert.ok(Math.abs(solarElevationDeg(10, 40, subsolar) - 90) < 1e-5);
  assert.ok(Math.abs(solarElevationDeg(-10, -140, subsolar) + 90) < 1e-5);
  assert.ok(
    Math.abs(solarElevationDeg(-80, 40, subsolar)) < 1e-9,
    '90° of arc away',
  );
});

test('day is clear, night is dark, and the gray line glows at the terminator', () => {
  assert.deepEqual(dayNightPixel(30), [0, 0, 0, 0]);
  const night = dayNightPixel(-40);
  const twilight = dayNightPixel(-9);
  assert.ok(night[3] > twilight[3], 'night deepens past twilight');
  assert.ok(night[2] > night[0], 'night is blue-black');
  const grayLine = dayNightPixel(-2.6);
  assert.ok(grayLine[0] > grayLine[2], 'the gray line is warm');
  assert.ok(grayLine[3] > 0);
});

test('the raster is a whole-Earth equirectangular image', () => {
  const at = Date.parse('2026-06-21T12:00:00Z');
  const raster = createDayNightRaster(at, { width: 36, height: 18 });
  assert.equal(raster.rgba.length, 36 * 18 * 4);
  const alphaAt = (lat, lon) => {
    const x = Math.floor(((lon + 180) / 360) * 36);
    const y = Math.floor(((90 - lat) / 180) * 18);
    return raster.rgba[(y * 36 + x) * 4 + 3];
  };
  assert.equal(alphaAt(20, 0), 0, 'noon over Greenwich is daylight');
  assert.ok(alphaAt(-20, 175) > 0, 'the antipode is night');
});

test('the overlay fades out from orbit down to city zoom', () => {
  assert.equal(dayNightFade(20_000_000), 1);
  assert.equal(dayNightFade(DAY_NIGHT_FADE_M.high), 1);
  assert.equal(dayNightFade(DAY_NIGHT_FADE_M.low), 0);
  assert.equal(dayNightFade(5_000), 0);
  const middle = dayNightFade(
    Math.sqrt(DAY_NIGHT_FADE_M.low * DAY_NIGHT_FADE_M.high),
  );
  assert.ok(Math.abs(middle - 0.5) < 1e-9);
  assert.equal(dayNightFade(undefined), 1);
});
