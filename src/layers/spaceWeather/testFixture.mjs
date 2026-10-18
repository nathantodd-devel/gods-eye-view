/** Trimmed copies of live SWPC responses (18 Oct 2026). */
export const SWPC_FIXTURE = Object.freeze({
  wind: [{ proton_speed: 419, time_tag: '2026-10-18T21:55:00Z' }],
  mag: [{ bt: 5, bz_gsm: -2, time_tag: '2026-10-18T21:55:00Z' }],
  kpNow: [
    { time_tag: '2026-10-18T21:57:00', kp_index: 1, estimated_kp: 1.33 },
    { time_tag: '2026-10-18T21:58:00', kp_index: 1, estimated_kp: 1.67 },
  ],
  kp: [
    { time_tag: '2026-10-18T12:00:00', Kp: 2.33 },
    { time_tag: '2026-10-18T15:00:00', Kp: 3.0 },
    { time_tag: '2026-10-18T18:00:00', Kp: 2.67 },
  ],
  xray: [
    {
      time_tag: '2026-10-18T21:58:00Z',
      flux: 6.0e-9,
      energy: '0.05-0.4nm',
    },
    {
      time_tag: '2026-10-18T21:58:00Z',
      flux: 3.2e-6,
      energy: '0.1-0.8nm',
    },
    {
      time_tag: '2026-10-18T21:57:00Z',
      flux: 9e-5,
      energy: '0.1-0.8nm',
    },
  ],
  flux: [{ flux: 137, time_tag: '2026-10-18T20:00:00' }],
  scales: {
    '-1': { R: { Scale: '1' }, S: { Scale: '0' }, G: { Scale: '2' } },
    0: { R: { Scale: '0' }, S: { Scale: '0' }, G: { Scale: '1' } },
  },
  alerts: [
    {
      issue_datetime: '2026-10-18 17:24:58.920',
      message:
        'Space Weather Message Code: WATA20\r\nSerial Number: 1131\r\nIssue Time: 2026 Oct 18 1724 UTC\r\n\r\nWATCH: Geomagnetic Storm Category G1 Predicted \nHighest Storm Level Predicted by Day:',
    },
    {
      issue_datetime: '2026-10-16 09:00:00.000',
      message: 'ALERT: Type II Radio Emission',
    },
  ],
});
