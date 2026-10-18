import * as Cesium from 'cesium';
import { t } from '../i18n/index.js';

export const PROJECTION_MODES = Object.freeze(['globe', 'mercator']);
/** Google 3D is a 3D tileset; the flat map can only drape imagery. */
const FLAT_UNSUPPORTED_STACK = 'photoreal';
const FLAT_REPLACEMENT_STACK = 'esri-imagery';

/**
 * Own the Globe / Mercator projection. Mercator is Cesium's 2D scene mode over
 * the viewer's Web Mercator map projection. Entering it from Google 3D swaps
 * to Esri imagery and locks Google 3D; leaving restores Google 3D unless the
 * operator chose another source meanwhile. The scene mode is authoritative.
 *
 * Morphs are instant. While Cesium animates one, the camera has no heading,
 * pitch or roll, and the many per-frame readers of those would fail.
 * @param {{ scene: object, mapStackController?: object|null, onChange?: (mode: string) => void, requestRender?: () => void }} options
 */
export function createProjectionMode({
  scene,
  mapStackController = null,
  onChange = () => {},
  requestRender = () => scene?.requestRender?.(),
}) {
  if (!scene) throw new TypeError('A Cesium scene is required');
  let destroyed = false;
  let generation = 0;
  let restoreStackId = null;
  /** The entry's switch to Esri, which a quick exit must outwait. */
  let pendingSwitch = null;

  const getMode = () =>
    scene.mode === Cesium.SceneMode.SCENE2D ? 'mercator' : 'globe';
  const notify = () => {
    if (destroyed) return;
    requestRender();
    try {
      onChange(getMode());
    } catch (error) {
      console.warn('[ProjectionMode] change listener failed:', error);
    }
  };
  // Cesium's morphs reset the camera to a whole-world view; keep the place.
  const captureView = () => {
    const camera = scene.camera;
    if (!camera) return null;
    const canvas = scene.canvas;
    if (scene.mode === Cesium.SceneMode.SCENE3D && canvas) {
      const center = camera.pickEllipsoid(
        new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2),
      );
      if (center) {
        const { longitude, latitude } =
          Cesium.Cartographic.fromCartesian(center);
        const height = Cesium.Cartesian3.distance(camera.positionWC, center);
        return { longitude, latitude, height };
      }
    }
    const carto = camera.positionCartographic;
    return carto && Number.isFinite(carto.height)
      ? {
          longitude: carto.longitude,
          latitude: carto.latitude,
          height: carto.height,
        }
      : null;
  };
  const morph = (to, keepView) => {
    const view = keepView ? captureView() : null;
    if (to === 'mercator') scene.morphTo2D(0);
    else scene.morphTo3D(0);
    if (!view || scene.mode === Cesium.SceneMode.MORPHING) return;
    scene.camera.setView({
      destination: Cesium.Cartesian3.fromRadians(
        view.longitude,
        view.latitude,
        view.height,
      ),
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    });
  };
  // A morph started elsewhere (Cesium's own widgets) still updates the controls.
  const removeMorphListener =
    scene.morphComplete?.addEventListener?.(notify) || null;

  async function enterMercator(current, keepView) {
    mapStackController?.setStackLock?.(
      FLAT_UNSUPPORTED_STACK,
      t('Google 3D needs Globe view'),
    );
    if (mapStackController?.getActiveId?.() === FLAT_UNSUPPORTED_STACK) {
      restoreStackId = FLAT_UNSUPPORTED_STACK;
      pendingSwitch = mapStackController.setStack(FLAT_REPLACEMENT_STACK);
      await pendingSwitch;
      if (destroyed || current !== generation) return;
    }
    if (scene.mode !== Cesium.SceneMode.SCENE2D) morph('mercator', keepView);
  }

  async function enterGlobe(current, keepView) {
    mapStackController?.setStackLock?.(FLAT_UNSUPPORTED_STACK, null);
    if (scene.mode !== Cesium.SceneMode.SCENE3D) morph('globe', keepView);
    // An entry superseded mid-switch still lands Esri; restore after it.
    await pendingSwitch?.catch(() => {});
    if (destroyed || current !== generation) return;
    pendingSwitch = null;
    const restore = restoreStackId;
    restoreStackId = null;
    if (
      restore &&
      mapStackController?.getActiveId?.() === FLAT_REPLACEMENT_STACK &&
      mapStackController.isStackAvailable?.(restore)
    )
      await mapStackController.setStack(restore);
  }

  /**
   * @param {'globe'|'mercator'} mode
   * @param {{ keepView?: boolean }} [options] - Whether to keep looking at
   *   the same place; features that set their own camera pass false.
   * @returns {Promise<string>} The mode after this request settles.
   */
  async function setMode(mode, { keepView = true } = {}) {
    if (destroyed || !PROJECTION_MODES.includes(mode)) return getMode();
    const current = ++generation;
    if (mode === 'mercator') await enterMercator(current, keepView);
    else await enterGlobe(current, keepView);
    if (destroyed || current !== generation) return getMode();
    notify();
    return getMode();
  }

  return {
    getMode,
    setMode,
    /** The stack a share link should name: the one Mercator stands in for. */
    getShareStackId: () =>
      restoreStackId || mapStackController?.getActiveId?.() || null,
    /** Return to the globe at once, for features that need a 3D camera. */
    ensureGlobe() {
      return getMode() === 'globe'
        ? Promise.resolve('globe')
        : setMode('globe', { keepView: false });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation++;
      removeMorphListener?.();
    },
  };
}

/**
 * Bind the Globe / Mercator buttons (`[data-projection]` inside `container`).
 * The projection owner stays authoritative; `render()` re-syncs pressed state.
 * @param {{ container: HTMLElement|null, projection: object, claimSelection?: () => void, onSelected?: () => void }} options
 */
export function bindProjectionControls({
  container,
  projection,
  claimSelection = () => {},
  onSelected = () => {},
}) {
  const buttons = Array.from(
    container?.querySelectorAll?.('[data-projection]') || [],
  );
  const removers = [];
  const render = () => {
    const mode = projection.getMode();
    for (const button of buttons) {
      const active = button.dataset.projection === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  };
  for (const button of buttons) {
    const handler = () => {
      claimSelection();
      void projection
        .setMode(button.dataset.projection)
        .then(onSelected)
        .catch((error) =>
          console.warn('[ProjectionMode] switch failed:', error),
        );
    };
    button.addEventListener('click', handler);
    removers.push(() => button.removeEventListener('click', handler));
  }
  render();
  return {
    render,
    destroy() {
      for (const remove of removers.splice(0)) remove();
    },
  };
}
