import * as Cesium from 'cesium';
import { t } from '../../i18n/index.js';
import { encodeMaidenhead } from '../../data/maidenhead.js';
import { maidenheadGridLines } from './model.js';
export * from './model.js';

const FIELD_COLOR = '#7fd4ff';

/**
 * Own the Maidenhead locator grid: field lines (20° × 10°) from afar and
 * 2° × 1° squares up close, ground-clamped so they drape on every map source.
 * The row names the locator under the centre of the view.
 */
export function createMaidenheadGridLayer({ cesium = Cesium } = {}) {
  let viewer = null;
  let dataSource = null;
  let enabled = false;
  let shownKey = null;
  let centreLocator = null;
  let lineCount = 0;
  let removeMoveEnd = null;
  let rowControlsListener = null;
  const notify = () => rowControlsListener?.();

  const viewRectangle = () => {
    const rectangle = viewer?.camera?.computeViewRectangle?.();
    if (!rectangle) return null;
    const toDeg = cesium.Math.toDegrees;
    return {
      west: toDeg(rectangle.west),
      south: toDeg(rectangle.south),
      east: toDeg(rectangle.east),
      north: toDeg(rectangle.north),
    };
  };

  const centre = () => {
    const canvas = viewer?.scene?.canvas;
    if (!canvas) return null;
    const point = viewer.camera.pickEllipsoid(
      new cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2),
    );
    if (!point) return null;
    const { latitude, longitude } = cesium.Cartographic.fromCartesian(point);
    return encodeMaidenhead(
      cesium.Math.toDegrees(latitude),
      cesium.Math.toDegrees(longitude),
    );
  };

  const render = () => {
    if (!enabled || !dataSource) return;
    const { level, lines } = maidenheadGridLines(
      viewRectangle(),
      viewer.camera.positionCartographic?.height,
    );
    const key = `${level}:${lines.map(({ id }) => id).join(',')}`;
    const locator = centre();
    if (locator !== centreLocator) {
      centreLocator = locator;
      notify();
    }
    if (key === shownKey) return;
    shownKey = key;
    dataSource.entities.suspendEvents();
    dataSource.entities.removeAll();
    const color = cesium.Color.fromCssColorString(FIELD_COLOR);
    for (const line of lines) {
      dataSource.entities.add({
        id: `maidenhead:${line.id}`,
        polyline: {
          clampToGround: true,
          classificationType: cesium.ClassificationType.BOTH,
          positions: line.points.map(([lon, lat]) =>
            cesium.Cartesian3.fromDegrees(lon, lat),
          ),
          width: line.major ? 2 : 1,
          material: color.withAlpha(line.major ? 0.75 : 0.4),
          arcType:
            line.kind === 'parallel'
              ? cesium.ArcType.RHUMB
              : cesium.ArcType.GEODESIC,
        },
      });
    }
    dataSource.entities.resumeEvents();
    lineCount = lines.length;
    viewer.scene?.requestRender?.();
    notify();
  };

  const layer = {
    id: 'maidenhead-grid',
    name: 'Maidenhead grid',
    icon: '#',
    source: 'Computed · Maidenhead locator system',
    updateInterval: 3_600_000,

    init(nextViewer) {
      if (viewer) throw new Error('Maidenhead grid is already initialized');
      viewer = nextViewer;
      dataSource = new cesium.CustomDataSource('maidenhead-grid');
      dataSource.show = false;
      viewer.dataSources.add(dataSource);
    },

    enable() {
      enabled = true;
      if (dataSource) dataSource.show = true;
      removeMoveEnd ??=
        viewer?.camera?.moveEnd?.addEventListener(render) ?? null;
      render();
    },

    disable() {
      enabled = false;
      removeMoveEnd?.();
      removeMoveEnd = null;
      if (dataSource) {
        dataSource.show = false;
        dataSource.entities.removeAll();
      }
      shownKey = null;
      centreLocator = null;
      lineCount = 0;
      notify();
    },

    async update() {
      render();
      return enabled;
    },

    destroy() {
      this.disable();
      if (dataSource) viewer?.dataSources?.remove(dataSource, true);
      dataSource = null;
      viewer = null;
      rowControlsListener = null;
    },

    getRowControls() {
      if (!enabled) return null;
      return {
        info: centreLocator
          ? t('View centre {locator}', { locator: centreLocator })
          : t('Squares appear below 2,000 km'),
      };
    },

    setRowControlsListener(listener) {
      rowControlsListener = typeof listener === 'function' ? listener : null;
    },

    getStats() {
      return {
        count: lineCount,
        lastUpdate: enabled ? Date.now() : null,
        error: null,
        stale: false,
      };
    },
  };
  return layer;
}
