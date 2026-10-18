import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createProjectionMode } from './projectionMode.js';

function fakeScene() {
  const listeners = new Set();
  const scene = {
    mode: Cesium.SceneMode.SCENE3D,
    morphs: [],
    morphComplete: {
      addEventListener(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
    listenerCount: () => listeners.size,
    morphTo2D(duration) {
      scene.morphs.push(['2D', duration]);
      scene.mode = Cesium.SceneMode.SCENE2D;
    },
    morphTo3D(duration) {
      scene.morphs.push(['3D', duration]);
      scene.mode = Cesium.SceneMode.SCENE3D;
    },
  };
  return scene;
}

function fakeController(activeId) {
  const locks = new Map();
  let release = null;
  const controller = {
    switches: [],
    locks,
    hold() {
      let resolve;
      release = new Promise((r) => (resolve = r));
      return resolve;
    },
    getActiveId: () => activeId,
    isStackAvailable: (id) => !locks.has(id),
    setStackLock(id, reason) {
      if (reason) locks.set(id, reason);
      else locks.delete(id);
    },
    async setStack(id) {
      controller.switches.push(id);
      if (release) await release;
      activeId = id;
    },
  };
  return controller;
}

test('Mercator from Google 3D drapes Esri, locks 3D, and restores it on exit', async () => {
  const scene = fakeScene();
  const controller = fakeController('photoreal');
  const modes = [];
  const projection = createProjectionMode({
    scene,
    mapStackController: controller,
    onChange: (mode) => modes.push(mode),
    requestRender() {},
  });
  assert.equal(await projection.setMode('mercator'), 'mercator');
  assert.deepEqual(controller.switches, ['esri-imagery']);
  assert.ok(controller.locks.has('photoreal'));
  // Instant: an animated morph leaves the camera without an orientation.
  assert.deepEqual(scene.morphs, [['2D', 0]]);
  assert.equal(projection.getShareStackId(), 'photoreal');

  assert.equal(await projection.setMode('globe'), 'globe');
  assert.deepEqual(controller.switches, ['esri-imagery', 'photoreal']);
  assert.equal(controller.locks.size, 0);
  assert.deepEqual(modes, ['mercator', 'globe']);
  assert.ok(scene.morphs.every(([, duration]) => duration === 0));
});

test('Mercator over a draped stack leaves the stack alone', async () => {
  const scene = fakeScene();
  const controller = fakeController('osm');
  const projection = createProjectionMode({
    scene,
    mapStackController: controller,
    requestRender() {},
  });
  await projection.setMode('mercator');
  await projection.ensureGlobe();
  assert.deepEqual(controller.switches, []);
  assert.deepEqual(scene.morphs, [
    ['2D', 0],
    ['3D', 0],
  ]);
});

test('an operator source choice made on the flat map survives leaving it', async () => {
  const scene = fakeScene();
  const controller = fakeController('photoreal');
  const projection = createProjectionMode({
    scene,
    mapStackController: controller,
    requestRender() {},
  });
  await projection.setMode('mercator');
  await controller.setStack('osm');
  await projection.setMode('globe');
  assert.deepEqual(controller.switches, ['esri-imagery', 'osm']);
});

test('a superseded Mercator request never flattens the globe', async () => {
  const scene = fakeScene();
  const controller = fakeController('photoreal');
  const resolve = controller.hold();
  const projection = createProjectionMode({
    scene,
    mapStackController: controller,
    requestRender() {},
  });
  const entering = projection.setMode('mercator');
  const leaving = projection.setMode('globe');
  resolve();
  await Promise.all([entering, leaving]);
  assert.equal(projection.getMode(), 'globe');
  assert.ok(!scene.morphs.some(([mode]) => mode === '2D'));
  assert.equal(controller.locks.size, 0);
  assert.equal(controller.getActiveId(), 'photoreal');
});

test('destroy releases the morph listener once and ignores later requests', async () => {
  const scene = fakeScene();
  const projection = createProjectionMode({ scene, requestRender() {} });
  assert.equal(scene.listenerCount(), 1);
  projection.destroy();
  projection.destroy();
  assert.equal(scene.listenerCount(), 0);
  assert.equal(await projection.setMode('mercator'), 'globe');
  assert.deepEqual(scene.morphs, []);
});

test('a user toggle keeps looking at the same place; cockpit-style exits do not', async () => {
  const scene = fakeScene();
  const views = [];
  scene.camera = {
    positionCartographic: Cesium.Cartographic.fromDegrees(-97.74, 30.27, 3000),
    setView: (options) => views.push(options),
  };
  const projection = createProjectionMode({ scene, requestRender() {} });
  await projection.setMode('mercator');
  assert.equal(views.length, 1);
  const landed = Cesium.Cartographic.fromCartesian(views[0].destination);
  assert.ok(Math.abs(Cesium.Math.toDegrees(landed.latitude) - 30.27) < 1e-6);
  assert.ok(Math.abs(landed.height - 3000) < 0.5);
  await projection.ensureGlobe();
  assert.equal(views.length, 1);
});
