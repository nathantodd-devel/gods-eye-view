import { formatNumber, msg, t } from '../../i18n/index.js';
import { translateFeedError } from '../../ui/statusText.js';
import { createRasterFeedLayer } from '../globeRaster/feedLayer.js';
import { DRAP_LEGEND, DRAP_STALE_MS, createDrapRaster } from './model.js';
export * from './model.js';
export { createSwpcDrapSource } from './source.js';

/**
 * Own the D-region absorption overlay: NOAA SWPC's D-RAP map of the highest
 * HF frequency losing at least 1 dB, which is how flare radio blackouts and
 * polar-cap absorption show up on the map.
 */
export function createDrapLayer({ source, ...options } = {}) {
  return createRasterFeedLayer({
    id: 'drap-absorption',
    name: 'D-region absorption',
    icon: '▦',
    sourceLabel: 'NOAA SWPC D-RAP',
    updateInterval: 300_000,
    source,
    toRaster: createDrapRaster,
    count: (snapshot) => snapshot.cells,
    observedMs: (snapshot) => snapshot.validMs,
    staleAfterMs: DRAP_STALE_MS,
    shellHeight: 4_600,
    priority: 2,
    failureText: msg('D-RAP request failed'),
    rowControls: (snapshot, error) => ({
      legend: DRAP_LEGEND.map(({ color, label, mhz }) => ({
        color,
        label: t(label, { mhz }),
      })),
      info: error
        ? translateFeedError(error)
        : snapshot
          ? t('Absorbed up to {mhz} MHz · {xray}', {
              mhz: formatNumber(snapshot.maxMhz, { maximumFractionDigits: 1 }),
              // SWPC's own message has no catalog entry and shows as issued.
              xray: snapshot.xrayMessage || '—',
            })
          : t('Waiting for SWPC data'),
    }),
    ...options,
  });
}
