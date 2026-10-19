import * as Cesium from 'cesium';
import { formatNumber, msg, t } from '../../i18n/index.js';
import { translateFeedError } from '../../ui/statusText.js';
import { MUF_LABEL, MUF_LABEL_NO_BAND, MUF_STALE_MS } from './model.js';
export * from './model.js';
export { createKc2gMufSource } from './source.js';

const levelLabel = ({ mhz, band }) =>
  band
    ? t(MUF_LABEL, {
        band,
        mhz: formatNumber(mhz, { maximumFractionDigits: 1 }),
      })
    : t(MUF_LABEL_NO_BAND, {
        mhz: formatNumber(mhz, { maximumFractionDigits: 1 }),
      });

/**
 * Own the MUF map: KC2G's ionosonde-derived MUF(3000) contours, one line per
 * amateur band frequency. Inside a contour that band opens for a 3,000 km
 * hop; the legend names which band each colour is.
 */
export function createMufLayer({
  source,
  cesium = Cesium,
  now = () => Date.now(),
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('MUF map requires a snapshot source');
  let viewer = null;
  let dataSource = null;
  let enabled = false;
  let request = null;
  let snapshot = null;
  let lastUpdate = null;
  let lastError = null;
  let rowControlsListener = null;
  const notify = () => rowControlsListener?.();

  const render = () => {
    if (!dataSource) return;
    dataSource.entities.suspendEvents();
    dataSource.entities.removeAll();
    for (const line of snapshot?.lines ?? []) {
      dataSource.entities.add({
        id: `muf:${line.id}`,
        polyline: {
          clampToGround: true,
          classificationType: cesium.ClassificationType.BOTH,
          positions: line.points.map(([lon, lat]) =>
            cesium.Cartesian3.fromDegrees(lon, lat),
          ),
          width: 2,
          material: cesium.Color.fromCssColorString(line.color).withAlpha(0.9),
          arcType: cesium.ArcType.GEODESIC,
        },
        properties: { mhz: line.mhz, band: line.band },
      });
    }
    dataSource.entities.resumeEvents();
    viewer?.scene?.requestRender?.();
  };

  return {
    id: 'muf-map',
    name: 'MUF map',
    icon: '〰',
    source: 'KC2G · GIRO ionosondes',
    updateInterval: 900_000,

    init(nextViewer) {
      if (viewer) throw new Error('MUF map is already initialized');
      viewer = nextViewer;
      dataSource = new cesium.CustomDataSource('muf-map');
      dataSource.show = false;
      viewer.dataSources.add(dataSource);
    },

    enable() {
      enabled = true;
      if (dataSource) dataSource.show = true;
      render();
      notify();
    },

    disable() {
      request?.abort();
      request = null;
      enabled = false;
      if (dataSource) {
        dataSource.show = false;
        dataSource.entities.removeAll();
      }
      notify();
    },

    async update() {
      if (!enabled) return false;
      request?.abort();
      const current = new AbortController();
      request = current;
      try {
        const next = await source.getSnapshot({ signal: current.signal });
        if (current.signal.aborted || request !== current || !enabled)
          return false;
        snapshot = next;
        lastUpdate = now();
        lastError = null;
        render();
        notify();
        return true;
      } catch (error) {
        if (current.signal.aborted || request !== current) return false;
        lastError = error?.message || msg('MUF request failed');
        console.warn('[Data:MUF] Refresh failed:', lastError);
        notify();
        return false;
      } finally {
        if (request === current) request = null;
      }
    },

    destroy() {
      this.disable();
      if (dataSource) viewer?.dataSources?.remove(dataSource, true);
      dataSource = null;
      viewer = null;
      snapshot = null;
      rowControlsListener = null;
    },

    getRowControls() {
      if (!enabled) return null;
      return {
        legend: (snapshot?.levels ?? []).map((level) => ({
          color: level.color,
          label: levelLabel(level),
        })),
        info: lastError
          ? translateFeedError(lastError)
          : snapshot
            ? t('MUF(3000): a band opens inside its contour')
            : t('Waiting for KC2G data'),
      };
    },

    setRowControlsListener(listener) {
      rowControlsListener = typeof listener === 'function' ? listener : null;
    },

    getStats() {
      const observed = snapshot?.renderedMs ?? null;
      return {
        count: snapshot?.lines.length ?? 0,
        lastUpdate,
        error: lastError,
        observedAt: observed,
        stale:
          lastUpdate !== null &&
          (observed === null || now() - observed > MUF_STALE_MS),
      };
    },
  };
}
