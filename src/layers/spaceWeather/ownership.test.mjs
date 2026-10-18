import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpaceWeatherLayer } from './index.js';
import { normalizeSpaceWeather } from './model.js';
import { SWPC_FIXTURE } from './testFixture.mjs';
import { layerFeedState } from '../../data/feedState.js';

// Normalized at the fixture's own time: the real clock would age it into STALE.
const FIXTURE_NOW = Date.parse('2026-10-18T22:00:00Z');
const snapshot = () => normalizeSpaceWeather(SWPC_FIXTURE, FIXTURE_NOW);

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

test('the readout card carries the conditions and estimated band ratings', async () => {
  const layer = createSpaceWeatherLayer({
    source: { getSnapshot: async () => snapshot() },
    now: () => FIXTURE_NOW,
  });
  layer.init({});
  layer.enable();
  assert.equal(await layer.update(), true);
  const controls = layer.getRowControls();
  assert.equal(controls.readout, true);
  const text = controls.summary.lines.map(({ text }) => text).join('\n');
  assert.match(text, /419 km\/s/);
  assert.match(text, /Bz -2 nT/);
  assert.match(text, /C3\.2/);
  assert.match(text, /WATCH: Geomagnetic Storm Category G1 Predicted/);
  assert.deepEqual(
    controls.list.items.map(({ lead }) => lead),
    ['80m-40m', '30m-20m', '17m-15m', '12m-10m'],
  );
  assert.equal(controls.list.items[1].text, 'Day Good · Night Good');
  assert.equal(layer.getStats().count, 5);
  assert.equal(layerFeedState(layer.getStats()), 'nominal');
});

test('a response that lands after disable or a newer refresh is dropped', async () => {
  const pending = [];
  const layer = createSpaceWeatherLayer({
    source: {
      getSnapshot: () => {
        const next = deferred();
        pending.push(next);
        return next.promise;
      },
    },
  });
  layer.init({});
  layer.enable();
  const first = layer.update();
  const second = layer.update();
  pending[0].resolve(snapshot());
  pending[1].resolve(snapshot());
  assert.equal(await first, false, 'superseded');
  assert.equal(await second, true);

  const late = layer.update();
  layer.disable();
  pending[2].resolve(snapshot());
  assert.equal(await late, false);
  assert.equal(await layer.update(), false, 'disabled layers do not fetch');
  assert.equal(pending.length, 3);
});

test('a failed refresh reports its error and keeps the last snapshot', async () => {
  let fail = false;
  const layer = createSpaceWeatherLayer({
    source: {
      getSnapshot: async () => {
        if (fail) throw new Error('SWPC HTTP 503');
        return snapshot();
      },
    },
  });
  layer.init({});
  layer.enable();
  await layer.update();
  fail = true;
  assert.equal(await layer.update(), false);
  assert.equal(layer.getStats().error, 'SWPC HTTP 503');
  assert.equal(layer.getRowControls().list.items.length, 4);
});

test('readings go stale with the clock even when no refresh succeeds', async () => {
  let clock = FIXTURE_NOW;
  let fail = false;
  const layer = createSpaceWeatherLayer({
    source: {
      getSnapshot: async () => {
        if (fail) throw new Error('SWPC HTTP 503');
        return snapshot();
      },
    },
    now: () => clock,
  });
  layer.init({});
  layer.enable();
  await layer.update();
  assert.equal(layer.getStats().stale, false);
  fail = true;
  clock += 45 * 60 * 1000;
  await layer.update();
  assert.equal(layer.getStats().stale, true);
  assert.equal(layerFeedState(layer.getStats()), 'stale');
});
