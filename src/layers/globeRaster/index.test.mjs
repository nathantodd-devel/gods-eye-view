import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobeRaster } from './index.js';
import { NO_IMAGERY_HOST } from '../weather/imageryHost.js';

function fakeCollection() {
  const layers = [];
  return {
    layers,
    get length() {
      return layers.length;
    },
    get: (index) => layers[index],
    addImageryProvider(provider) {
      const layer = { provider, alpha: 1, show: true };
      layers.push(layer);
      return layer;
    },
    add(layer) {
      layers.push(layer);
    },
    remove(layer) {
      layers.splice(layers.indexOf(layer), 1);
    },
    raiseToTop() {},
  };
}

function harness() {
  const events = new EventTarget();
  let host = { collection: fakeCollection(), kind: 'globe' };
  const canvas = (id) => ({
    width: 4,
    height: 2,
    toDataURL: () => `data:image/png;base64,${id}`,
  });
  const cesium = {
    Rectangle: { MAX_VALUE: 'whole-earth' },
    SingleTileImageryProvider: class {
      constructor(options) {
        Object.assign(this, options);
      }
    },
  };
  const raster = createGlobeRaster({
    cesium,
    getViewer: () => ({ scene: { requestRender() {} } }),
    getHost: () => host,
    shellHeight: 1,
    eventTarget: events,
  });
  return {
    raster,
    canvas,
    events,
    get host() {
      return host;
    },
    setHost(next) {
      host = next;
    },
  };
}

test('a canvas drapes as whole-Earth globe imagery with its alpha', () => {
  const env = harness();
  env.raster.setImage(env.canvas('a'));
  env.raster.setAlpha(0.4);
  const [layer] = env.host.collection.layers;
  assert.equal(layer.provider.url, 'data:image/png;base64,a');
  assert.equal(layer.provider.rectangle, 'whole-earth');
  assert.equal(layer.alpha, 0.4);
  env.raster.setAlpha(0);
  assert.equal(layer.show, false);
  env.raster.destroy();
});

test('a new image replaces the old one only after it has had time to load', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = harness();
  env.raster.setImage(env.canvas('a'));
  env.raster.setImage(env.canvas('b'));
  assert.equal(env.host.collection.layers.length, 2, 'no gap while b loads');
  t.mock.timers.tick(1_500);
  assert.deepEqual(
    env.host.collection.layers.map(({ provider }) => provider.url),
    ['data:image/png;base64,b'],
  );
  env.raster.setImage(env.canvas('c'));
  env.raster.destroy();
  assert.equal(env.host.collection.layers.length, 0, 'destroy leaves nothing');
});

test('without an imagery host the overlay reports why and follows the map back', () => {
  const env = harness();
  const globe = env.host;
  env.setHost({ collection: null, kind: 'none' });
  env.raster.setImage(env.canvas('a'));
  assert.equal(env.raster.getError(), NO_IMAGERY_HOST);
  env.setHost(globe);
  env.events.dispatchEvent(new Event('gev:map-stack-changed'));
  assert.equal(env.raster.getError(), null);
  assert.equal(globe.collection.layers.length, 1);
  env.raster.clear();
  assert.equal(globe.collection.layers.length, 0);
  env.events.dispatchEvent(new Event('gev:map-stack-changed'));
  assert.equal(
    globe.collection.layers.length,
    0,
    'a cleared overlay stays off',
  );
});
