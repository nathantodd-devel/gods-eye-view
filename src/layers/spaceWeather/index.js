import { formatNumber, msg, t } from '../../i18n/index.js';
import { translateFeedError } from '../../ui/statusText.js';
import { BAND_RATING_LABELS, SPACE_WEATHER_STALE_MS } from './model.js';
export * from './model.js';
export { createSwpcSpaceWeatherSource } from './source.js';

const signed = (value) =>
  `${value > 0 ? '+' : ''}${formatNumber(value, { maximumFractionDigits: 1 })}`;
const decimal = (value) => formatNumber(value, { maximumFractionDigits: 1 });

/**
 * Own the space-weather readout: solar wind, the interplanetary magnetic
 * field, Kp, X-ray flux, solar flux, the NOAA scales and estimated HF band
 * conditions. It draws nothing on the globe; the Weather panel card is the
 * whole presentation.
 */
export function createSpaceWeatherLayer({
  source,
  now = () => Date.now(),
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Space weather requires a snapshot source');
  let _viewer = null;
  let _request = null;
  let _snapshot = null;
  let _lastUpdate = null;
  let _lastError = null;
  let _enabled = false;
  let rowControlsListener = null;

  const notify = () => rowControlsListener?.();
  /**
   * Judged against the clock, not when the snapshot arrived: a feed that stops
   * answering must go STALE rather than keep reading as live.
   */
  const isStale = () =>
    _snapshot?.observedMs == null ||
    now() - _snapshot.observedMs > SPACE_WEATHER_STALE_MS;

  /** Readout lines for the card, already translated. */
  const lines = (snapshot) => {
    const out = [];
    const wind = snapshot.solarWind;
    const field = snapshot.magneticField;
    if (wind || field) {
      const parts = [];
      if (Number.isFinite(wind?.speedKms))
        parts.push(
          t('Solar wind {speed} km/s', {
            speed: formatNumber(Math.round(wind.speedKms)),
          }),
        );
      if (Number.isFinite(field?.btNt))
        parts.push(t('Bt {value} nT', { value: decimal(field.btNt) }));
      if (Number.isFinite(field?.bzNt))
        parts.push(t('Bz {value} nT', { value: signed(field.bzNt) }));
      out.push({ id: 'wind', text: parts.join(' · ') });
    }
    const indices = [];
    if (Number.isFinite(snapshot.kp?.value))
      indices.push(t('Kp {value}', { value: decimal(snapshot.kp.value) }));
    if (Number.isFinite(snapshot.sfi?.value))
      indices.push(
        t('SFI {value}', {
          value: formatNumber(Math.round(snapshot.sfi.value)),
        }),
      );
    if (snapshot.xray?.flareClass)
      indices.push(t('X-ray {class}', { class: snapshot.xray.flareClass }));
    if (indices.length) out.push({ id: 'indices', text: indices.join(' · ') });
    if (snapshot.scales) {
      const { R, S, G } = snapshot.scales;
      out.push({
        id: 'scales',
        text: t('NOAA scales R{r} · S{s} · G{g}', { r: R, s: S, g: G }),
      });
    }
    if (snapshot.kpTrend.length > 1)
      out.push({
        id: 'trend',
        text: t('Kp last 24 h: {values}', {
          values: snapshot.kpTrend.map(({ kp }) => decimal(kp)).join(' → '),
        }),
        muted: true,
      });
    if (snapshot.alert)
      out.push({
        id: 'alert',
        // SWPC's own headline text has no catalog entry and shows as issued.
        text: `${snapshot.alert.kind}: ${snapshot.alert.text}`,
      });
    if (snapshot.bands)
      out.push({
        id: 'bands-note',
        text: t('HF band ratings are estimated from SFI, Kp and X-ray flux'),
        muted: true,
      });
    return out;
  };

  const layer = {
    id: 'space-weather',
    name: 'Space weather',
    icon: '☀',
    source: 'NOAA SWPC',
    updateInterval: 60_000,

    init(viewer) {
      if (_viewer)
        throw new Error('Space weather layer is already initialized');
      _viewer = viewer;
      _snapshot = null;
      _lastUpdate = null;
      _lastError = null;
      _enabled = false;
    },

    enable() {
      _enabled = true;
      notify();
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      notify();
    },

    async update() {
      if (!_enabled) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const snapshot = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        _snapshot = snapshot;
        _lastUpdate = Date.now();
        _lastError = null;
        notify();
        return true;
      } catch (error) {
        if (request.signal.aborted || _request !== request) return false;
        _lastError = error?.message || msg('Space weather request failed');
        console.warn('[Data:SpaceWeather] Refresh failed:', _lastError);
        notify();
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy() {
      _request?.abort();
      _request = null;
      _enabled = false;
      _viewer = null;
      _snapshot = null;
      _lastUpdate = null;
      _lastError = null;
      rowControlsListener = null;
    },

    /** Weather-panel readout: the conditions, then estimated band ratings. */
    getRowControls() {
      const snapshot = _snapshot;
      const status = _lastError
        ? translateFeedError(_lastError)
        : !snapshot
          ? t('Waiting for SWPC data')
          : isStale()
            ? t('Solar wind data is stale')
            : t('Live · NOAA SWPC');
      return {
        readout: true,
        summary: {
          label: t('Space weather'),
          coverage: t('Global'),
          validTime: snapshot?.observedMs
            ? new Date(snapshot.observedMs).toISOString()
            : undefined,
          detail: snapshot?.observedMs
            ? t('Observed {time}', {
                time: new Date(snapshot.observedMs).toISOString().slice(11, 16),
              })
            : t('Unavailable'),
          status,
          units: '',
          lines: snapshot ? lines(snapshot) : [],
        },
        list: snapshot?.bands
          ? {
              ariaLabel: t('Estimated HF band conditions'),
              items: snapshot.bands.map(({ band, day, night }) => ({
                id: band,
                lead: band,
                text: t('Day {day} · Night {night}', {
                  day: t(BAND_RATING_LABELS[day]),
                  night: t(BAND_RATING_LABELS[night]),
                }),
                disabled: true,
              })),
            }
          : null,
      };
    },

    setRowControlsListener(listener) {
      rowControlsListener = typeof listener === 'function' ? listener : null;
    },

    getStats() {
      const parts = _snapshot
        ? [
            _snapshot.solarWind,
            _snapshot.magneticField,
            _snapshot.kp,
            _snapshot.xray,
            _snapshot.sfi,
          ].filter(Boolean).length
        : 0;
      return {
        count: parts,
        lastUpdate: _lastUpdate,
        error: _lastError,
        observedAt: _snapshot?.observedMs ?? null,
        // Only a completed refresh can be stale; before one there is no feed.
        stale: _lastUpdate !== null && isStale(),
      };
    },
  };
  return layer;
}
