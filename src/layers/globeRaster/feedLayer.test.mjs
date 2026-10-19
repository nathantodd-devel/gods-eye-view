import test from 'node:test';
import assert from 'node:assert/strict';
import { createRasterFeedLayer } from './feedLayer.js';
import { layerFeedState } from '../../data/feedState.js';

function harness({ getSnapshot, clock = { now: 1_000_000 } }) {
  const images = [];
  const calls = [];
  const document = {
    createElement: () => ({
      getContext: () => ({
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData() {},
      }),
    }),
  };
  const layer = createRasterFeedLayer({
    id: 'test-raster',
    name: 'Test raster',
    icon: '·',
    sourceLabel: 'Test',
    updateInterval: 1000,
    source: { getSnapshot },
    toRaster: () => ({ width: 2, height: 1, rgba: new Uint8ClampedArray(8) }),
    rowControls: (snapshot, error) => ({ info: error || snapshot?.label }),
    count: (snapshot) => snapshot.count,
    observedMs: (snapshot) => snapshot.observedMs,
    staleAfterMs: 60_000,
    shellHeight: 1,
    priority: 0,
    now: () => clock.now,
    createRaster: () => ({
      setImage: (canvas) => images.push(canvas),
      clear: () => calls.push('clear'),
      rehome: () => calls.push('rehome'),
      destroy: () => calls.push('destroy'),
      getError: () => null,
    }),
  });
  layer.init({ container: { ownerDocument: document } });
  return { layer, images, calls, clock };
}

test('a refresh paints the snapshot and reports it', async () => {
  const env = harness({
    getSnapshot: async () => ({ count: 7, observedMs: 990_000, label: 'ok' }),
  });
  env.layer.enable();
  assert.equal(await env.layer.update(), true);
  assert.equal(env.images.length, 1);
  assert.equal(env.layer.getStats().count, 7);
  assert.equal(env.layer.getRowControls().info, 'ok');
  assert.equal(layerFeedState(env.layer.getStats()), 'nominal');
  env.clock.now += 120_000;
  assert.equal(env.layer.getStats().stale, true, 'stale by the clock');
});

test('late, superseded and disabled refreshes never paint', async () => {
  const pending = [];
  const env = harness({
    getSnapshot: () => new Promise((resolve) => pending.push(resolve)),
  });
  env.layer.enable();
  const first = env.layer.update();
  const second = env.layer.update();
  pending[0]({ count: 1, observedMs: 1 });
  pending[1]({ count: 2, observedMs: 1 });
  assert.equal(await first, false);
  assert.equal(await second, true);
  const late = env.layer.update();
  env.layer.disable();
  pending[2]({ count: 3, observedMs: 1 });
  assert.equal(await late, false);
  assert.equal(env.images.length, 1);
  assert.equal(env.calls.at(-1), 'clear');
  assert.equal(env.layer.getRowControls(), null);
});

test('a failure keeps the last picture and reports the error', async () => {
  let fail = false;
  const env = harness({
    getSnapshot: async () => {
      if (fail) throw new Error('SWPC HTTP 503');
      return { count: 1, observedMs: 1_000_000 };
    },
  });
  env.layer.enable();
  await env.layer.update();
  fail = true;
  assert.equal(await env.layer.update(), false);
  assert.equal(env.layer.getStats().error, 'SWPC HTTP 503');
  assert.equal(env.layer.getRowControls().info, 'SWPC HTTP 503');
  assert.equal(env.images.length, 1);
});
