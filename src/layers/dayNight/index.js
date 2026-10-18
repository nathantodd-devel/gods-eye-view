import * as Cesium from 'cesium';
import { t } from '../../i18n/index.js';
import { createGlobeRaster } from '../globeRaster/index.js';
import {
  DAY_NIGHT_LEGEND,
  createDayNightRaster,
  dayNightFade,
} from './model.js';
export * from './model.js';

/** Below the wind and weather shells over Google 3D. */
const SHELL_HEIGHT_M = 4_400;
/** Fade steps smaller than this are not worth a render. */
const FADE_EPSILON = 0.02;

/**
 * Own the day/night overlay: the night side and its twilight darkening, and
 * the gray line, recomputed every minute. It is strongest from orbit and
 * fades away at city zoom, where it would only darken the street view.
 */
export function createDayNightLayer({
  cesium = Cesium,
  now = () => Date.now(),
  createRaster = createGlobeRaster,
} = {}) {
  let viewer = null;
  let raster = null;
  let imageryHost = null;
  let enabled = false;
  let lastDrawn = null;
  let fade = 1;
  let removePreRender = null;
  let rowControlsListener = null;
  const notify = () => rowControlsListener?.();

  const updateFade = () => {
    const next = dayNightFade(viewer?.camera?.positionCartographic?.height);
    // Always land exactly on 0 and 1, so the overlay fully hides and shows.
    const settled = next === 0 || next === 1;
    if (next === fade || (!settled && Math.abs(next - fade) < FADE_EPSILON))
      return;
    fade = next;
    raster?.setAlpha(fade);
  };

  const draw = () => {
    const document = viewer?.container?.ownerDocument ?? globalThis.document;
    if (!raster || !document?.createElement) return false;
    const { width, height, rgba } = createDayNightRaster(now());
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return false;
    const pixels = context.createImageData(width, height);
    pixels.data.set(rgba);
    context.putImageData(pixels, 0, 0);
    raster.setImage(canvas);
    raster.setAlpha(fade);
    lastDrawn = now();
    notify();
    return true;
  };

  const layer = {
    id: 'day-night',
    name: 'Day / night',
    icon: '◐',
    source: 'Computed · solar position',
    updateInterval: 60_000,

    init(nextViewer) {
      if (viewer) throw new Error('Day/night layer is already initialized');
      viewer = nextViewer;
      raster = createRaster({
        cesium,
        getViewer: () => viewer,
        getHost: () =>
          imageryHost?.() ?? {
            collection: viewer?.imageryLayers ?? null,
            kind: viewer?.scene?.globe?.show === false ? 'none' : 'globe',
          },
        shellHeight: SHELL_HEIGHT_M,
        priority: -1,
        onStatusChange: notify,
      });
    },

    /** The shell supplies the map source's imagery host, as for weather. */
    attachShellServices(services) {
      imageryHost =
        typeof services?.imageryHost === 'function'
          ? services.imageryHost
          : null;
      raster?.rehome();
    },

    enable() {
      enabled = true;
      fade = dayNightFade(viewer?.camera?.positionCartographic?.height);
      removePreRender ??=
        viewer?.scene?.preRender?.addEventListener(updateFade) ?? null;
      draw();
    },

    disable() {
      enabled = false;
      removePreRender?.();
      removePreRender = null;
      raster?.clear();
      lastDrawn = null;
      notify();
    },

    async update() {
      if (!enabled) return false;
      return draw();
    },

    destroy() {
      this.disable();
      raster?.destroy();
      raster = null;
      viewer = null;
      imageryHost = null;
      rowControlsListener = null;
    },

    getRowControls() {
      return {
        legend: DAY_NIGHT_LEGEND.map(({ color, label }) => ({
          color,
          label: t(label),
        })),
        info: t('Fades out at city zoom'),
      };
    },

    setRowControlsListener(listener) {
      rowControlsListener = typeof listener === 'function' ? listener : null;
    },

    getStats() {
      return {
        count: lastDrawn === null ? 0 : 1,
        lastUpdate: lastDrawn,
        error: raster?.getError() ?? null,
        stale: false,
      };
    },
  };
  return layer;
}
