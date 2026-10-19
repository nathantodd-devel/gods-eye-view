import * as Cesium from 'cesium';
import { msg } from '../../i18n/index.js';
import { createGlobeRaster } from './index.js';

/**
 * A layer that polls a gridded feed and drapes it as one whole-Earth raster:
 * the shape aurora and D-region absorption share. The feed module supplies
 * the snapshot-to-raster step and the row presentation; this owns the
 * refresh lifecycle (abort-and-guard, as the earthquake layer does), the
 * canvas and the imagery host.
 * @param {object} options
 * @param {{ getSnapshot: Function }} options.source
 * @param {(snapshot: object) => { width: number, height: number, rgba: Uint8ClampedArray }} options.toRaster
 * @param {(snapshot: object|null, error: string|null) => object|null} options.rowControls
 * @param {(snapshot: object) => number} options.count - Records for the layer row.
 * @param {(snapshot: object) => number|null} options.observedMs
 * @param {number} options.staleAfterMs
 */
export function createRasterFeedLayer({
  id,
  name,
  icon,
  sourceLabel,
  updateInterval,
  source,
  toRaster,
  rowControls,
  count,
  observedMs,
  staleAfterMs,
  shellHeight,
  priority,
  failureText = msg('Overlay request failed'),
  cesium = Cesium,
  now = () => Date.now(),
  createRaster = createGlobeRaster,
}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError(`${name} requires a snapshot source`);
  let viewer = null;
  let raster = null;
  let imageryHost = null;
  let enabled = false;
  let request = null;
  let snapshot = null;
  let lastUpdate = null;
  let lastError = null;
  let rowControlsListener = null;
  const notify = () => rowControlsListener?.();

  const paint = () => {
    const document = viewer?.container?.ownerDocument ?? globalThis.document;
    if (!snapshot || !raster || !document?.createElement) return;
    const { width, height, rgba } = toRaster(snapshot);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    const pixels = context.createImageData(width, height);
    pixels.data.set(rgba);
    context.putImageData(pixels, 0, 0);
    raster.setImage(canvas);
  };

  return {
    id,
    name,
    icon,
    source: sourceLabel,
    updateInterval,

    init(nextViewer) {
      if (viewer) throw new Error(`${name} is already initialized`);
      viewer = nextViewer;
      raster = createRaster({
        cesium,
        getViewer: () => viewer,
        getHost: () =>
          imageryHost?.() ?? {
            collection: viewer?.imageryLayers ?? null,
            kind: viewer?.scene?.globe?.show === false ? 'none' : 'globe',
          },
        shellHeight,
        priority,
        onStatusChange: notify,
      });
    },

    attachShellServices(services) {
      imageryHost =
        typeof services?.imageryHost === 'function'
          ? services.imageryHost
          : null;
      raster?.rehome();
    },

    enable() {
      enabled = true;
      paint();
      notify();
    },

    disable() {
      request?.abort();
      request = null;
      enabled = false;
      raster?.clear();
      notify();
    },

    async update() {
      if (!enabled) return false;
      request?.abort();
      const current = new AbortController();
      request = current;
      try {
        const next = await source.getSnapshot({ signal: current.signal });
        // A superseded or aborted request must not touch the scene, and neither
        // must one that lands after the layer was switched off.
        if (current.signal.aborted || request !== current || !enabled)
          return false;
        snapshot = next;
        lastUpdate = now();
        lastError = null;
        paint();
        notify();
        return true;
      } catch (error) {
        if (current.signal.aborted || request !== current) return false;
        lastError = error?.message || failureText;
        console.warn(`[Data:${name}] Refresh failed:`, lastError);
        notify();
        return false;
      } finally {
        if (request === current) request = null;
      }
    },

    destroy() {
      this.disable();
      raster?.destroy();
      raster = null;
      viewer = null;
      imageryHost = null;
      snapshot = null;
      rowControlsListener = null;
    },

    getRowControls() {
      return enabled ? rowControls(snapshot, lastError) : null;
    },

    setRowControlsListener(listener) {
      rowControlsListener = typeof listener === 'function' ? listener : null;
    },

    getStats() {
      const observed = snapshot ? observedMs(snapshot) : null;
      return {
        count: snapshot ? count(snapshot) : 0,
        lastUpdate,
        error: lastError ?? raster?.getError() ?? null,
        observedAt: observed,
        // Judged against the clock, so a feed that stops answering goes STALE.
        stale:
          lastUpdate !== null &&
          (observed === null || now() - observed > staleAfterMs),
      };
    },
  };
}
