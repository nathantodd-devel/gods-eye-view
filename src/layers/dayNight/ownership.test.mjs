import test from 'node:test';
import assert from 'node:assert/strict';
import { createDayNightLayer } from './index.js';

function harness({ heightM = 20_000_000 } = {}) {
  const calls = [];
  const preRender = new Set();
  const document = {
    createElement: () => ({
      getContext: () => ({
        createImageData: (width, height) => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
        putImageData() {},
      }),
    }),
  };
  const viewer = {
    container: { ownerDocument: document },
    camera: { positionCartographic: { height: heightM } },
    scene: {
      preRender: {
        addEventListener(listener) {
          preRender.add(listener);
          return () => preRender.delete(listener);
        },
      },
    },
  };
  const layer = createDayNightLayer({
    now: () => Date.parse('2026-06-21T12:00:00Z'),
    createRaster: () => ({
      setImage: (canvas) => calls.push(['image', canvas.width, canvas.height]),
      setAlpha: (alpha) => calls.push(['alpha', alpha]),
      clear: () => calls.push(['clear']),
      rehome: () => calls.push(['rehome']),
      destroy: () => calls.push(['destroy']),
      getError: () => null,
    }),
  });
  layer.init(viewer);
  return { layer, viewer, calls, preRender };
}

test('enabling draws the whole-Earth raster at the strength for the camera height', () => {
  const { layer, calls } = harness();
  layer.enable();
  assert.deepEqual(calls.slice(0, 2), [
    ['image', 720, 360],
    ['alpha', 1],
  ]);
  assert.equal(layer.getStats().count, 1);
});

test('zooming to a city fades the overlay away; zooming out brings it back', () => {
  const { layer, viewer, calls, preRender } = harness();
  layer.enable();
  calls.length = 0;
  viewer.camera.positionCartographic.height = 50_000;
  for (const listener of preRender) listener();
  assert.deepEqual(calls, [['alpha', 0]]);
  calls.length = 0;
  for (const listener of preRender) listener();
  assert.deepEqual(calls, [], 'an unchanged height costs nothing');
  viewer.camera.positionCartographic.height = 10_000_000;
  for (const listener of preRender) listener();
  assert.deepEqual(calls, [['alpha', 1]]);
});

test('disable clears the overlay and stops following the camera', async () => {
  const { layer, calls, preRender } = harness();
  layer.enable();
  layer.disable();
  assert.equal(preRender.size, 0);
  assert.deepEqual(calls.at(-1), ['clear']);
  assert.equal(await layer.update(), false);
  layer.destroy();
  assert.deepEqual(calls.at(-1), ['destroy']);
});
