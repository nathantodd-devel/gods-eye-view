import * as Cesium from 'cesium';
import { msg } from '../../i18n/index.js';
import { NO_IMAGERY_HOST } from '../weather/imageryHost.js';
import { orderWeatherImagery } from '../weather/imageryOrder.js';
import { createShellSurface } from '../weather/shellRendering.js';

/** An outgoing globe image stays until its replacement has had time to load. */
const REPLACE_DELAY_MS = 1_500;

/**
 * Show one whole-Earth equirectangular canvas on whatever surface the map
 * source offers: globe imagery on a draped stack (and the flat Mercator map),
 * a lifted shell over Google 3D, nothing when neither exists. The same path
 * the wind field uses, shared by the propagation overlays.
 * @param {object} options
 * @param {() => object|null} options.getViewer
 * @param {() => { collection: object|null, kind: 'globe'|'tileset'|'none' }} options.getHost
 * @param {number} options.shellHeight - Metres above the ellipsoid over Google 3D.
 * @param {number} [options.priority=0] - Order among weather imagery; higher draws on top.
 * @param {() => void} [options.onStatusChange]
 */
export function createGlobeRaster({
  cesium = Cesium,
  getViewer,
  getHost,
  shellHeight,
  priority = 0,
  eventTarget = globalThis,
  onStatusChange = () => {},
}) {
  let canvas = null;
  let alpha = 1;
  let imagery = null;
  let imageryCollection = null;
  let shell = null;
  let kind = null;
  let error = null;
  let listening = false;
  let destroyed = false;
  /** timer → the outgoing layer it will remove. */
  const pendingRemovals = new Map();

  const render = () => getViewer()?.scene?.requestRender?.();
  const setError = (next) => {
    if (error === next) return;
    error = next;
    onStatusChange();
  };
  const applyAlpha = () => {
    const show = alpha > 0;
    if (shell) {
      shell.setAlpha(alpha);
      shell.setShow(show);
    }
    if (imagery) {
      imagery.alpha = alpha;
      imagery.show = show;
    }
    render();
  };
  const removeShell = () => {
    shell?.destroy();
    shell = null;
  };
  const removeImageryNow = (layer, collection) => {
    if (layer && collection && !collection.isDestroyed?.())
      collection.remove(layer, true);
  };
  const retireImagery = () => {
    if (!imagery) return;
    const layer = imagery;
    const collection = imageryCollection;
    imagery = null;
    imageryCollection = null;
    const timer = setTimeout(() => {
      pendingRemovals.delete(timer);
      removeImageryNow(layer, collection);
      render();
    }, REPLACE_DELAY_MS);
    pendingRemovals.set(timer, { layer, collection });
  };
  const onStackChanged = () => rehome();
  const listen = (on) => {
    if (on === listening) return;
    listening = on;
    if (on)
      eventTarget?.addEventListener?.('gev:map-stack-changed', onStackChanged);
    else
      eventTarget?.removeEventListener?.(
        'gev:map-stack-changed',
        onStackChanged,
      );
  };

  function install() {
    const viewer = getViewer();
    if (destroyed || !canvas || !viewer) return;
    const host = getHost();
    if (host.kind === 'none') {
      removeShell();
      retireImagery();
      kind = 'none';
      setError(NO_IMAGERY_HOST);
      return;
    }
    try {
      if (host.kind === 'tileset') {
        retireImagery();
        if (!shell) {
          shell = createShellSurface({
            viewer,
            cesium,
            rectangle: cesium.Rectangle.MAX_VALUE,
            height: shellHeight,
          });
        }
        shell.setImage(canvas);
      } else {
        removeShell();
        const provider = new cesium.SingleTileImageryProvider({
          url: canvas.toDataURL('image/png'),
          tileWidth: canvas.width,
          tileHeight: canvas.height,
          rectangle: cesium.Rectangle.MAX_VALUE,
        });
        const next = host.collection.addImageryProvider(provider);
        orderWeatherImagery(host.collection, next, priority);
        retireImagery();
        imagery = next;
        imageryCollection = host.collection;
      }
      kind = host.kind;
      setError(null);
      applyAlpha();
    } catch {
      removeShell();
      retireImagery();
      setError(msg('Globe overlay image unavailable'));
    }
  }

  /** Follow the map source onto its new surface. */
  function rehome() {
    if (destroyed || !canvas) return;
    const host = getHost();
    if (
      host.kind !== kind ||
      (imagery && host.collection !== imageryCollection)
    )
      install();
  }

  return {
    /** Show `next` (an equirectangular canvas covering the whole Earth). */
    setImage(next) {
      if (destroyed) return;
      canvas = next || null;
      listen(Boolean(canvas));
      if (canvas) install();
      else this.clear();
    },
    /** 0 hides the overlay without discarding it. */
    setAlpha(next) {
      const value = Math.max(0, Math.min(1, Number(next) || 0));
      if (destroyed || value === alpha) return;
      alpha = value;
      applyAlpha();
    },
    rehome,
    clear() {
      canvas = null;
      listen(false);
      removeShell();
      if (imagery) removeImageryNow(imagery, imageryCollection);
      imagery = null;
      imageryCollection = null;
      kind = null;
      setError(null);
      render();
    },
    /** A reason the overlay cannot show, or null. */
    getError: () => error,
    destroy() {
      if (destroyed) return;
      this.clear();
      for (const [timer, { layer, collection }] of pendingRemovals) {
        clearTimeout(timer);
        removeImageryNow(layer, collection);
      }
      pendingRemovals.clear();
      destroyed = true;
    },
  };
}
