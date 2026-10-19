import { msg, t } from '../../i18n/index.js';
import { translateFeedError } from '../../ui/statusText.js';
import { createRasterFeedLayer } from '../globeRaster/feedLayer.js';
import { AURORA_LEGEND, AURORA_STALE_MS, createAuroraRaster } from './model.js';
export * from './model.js';
export { createOvationAuroraSource } from './source.js';

const utcTime = (ms) => new Date(ms).toISOString().slice(11, 16);

/**
 * Own the aurora oval: NOAA SWPC's OVATION nowcast of aurora probability,
 * draped as a green-to-red ramp. Where it reaches, polar HF paths are
 * disturbed and VHF auroral scatter is possible.
 */
export function createAuroraLayer({ source, ...options } = {}) {
  return createRasterFeedLayer({
    id: 'aurora-oval',
    name: 'Aurora oval',
    icon: '◠',
    sourceLabel: 'NOAA SWPC OVATION',
    updateInterval: 600_000,
    source,
    toRaster: createAuroraRaster,
    count: (snapshot) => snapshot.cells,
    observedMs: (snapshot) => snapshot.observedMs,
    staleAfterMs: AURORA_STALE_MS,
    // Over the night shading, under absorption.
    shellHeight: 4_500,
    priority: 1,
    failureText: msg('Aurora request failed'),
    rowControls: (snapshot, error) => ({
      legend: AURORA_LEGEND.map(({ color, label, percent }) => ({
        color,
        label: t(label, { percent }),
      })),
      info: error
        ? translateFeedError(error)
        : snapshot
          ? t('Forecast for {time} UTC · peak {percent}%', {
              time: snapshot.forecastMs ? utcTime(snapshot.forecastMs) : '—',
              percent: snapshot.peakPercent,
            })
          : t('Waiting for SWPC data'),
    }),
    ...options,
  });
}
