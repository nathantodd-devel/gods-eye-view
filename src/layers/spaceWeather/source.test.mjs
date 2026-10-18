import test from 'node:test';
import assert from 'node:assert/strict';
import { SPACE_WEATHER_FEEDS, createSwpcSpaceWeatherSource } from './source.js';
import { SWPC_FIXTURE } from './testFixture.mjs';

const FEED_BY_PATH = new Map(
  Object.entries(SPACE_WEATHER_FEEDS).map(([id, { path }]) => [path, id]),
);
const json = (body) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

function harness({ failing = new Set() } = {}) {
  let clock = Date.parse('2026-10-18T22:00:00Z');
  const requests = [];
  const source = createSwpcSpaceWeatherSource({
    now: () => clock,
    fetchImpl: async (url) => {
      const feed = FEED_BY_PATH.get(new URL(url).pathname);
      requests.push(feed);
      if (failing.has(feed)) return new Response('down', { status: 503 });
      return json(SWPC_FIXTURE[feed]);
    },
  });
  return {
    source,
    requests,
    advance(ms) {
      clock += ms;
    },
  };
}

test('every feed is read from the fixed SWPC host on the first refresh', async () => {
  const { source, requests } = harness();
  const snapshot = await source.getSnapshot();
  assert.deepEqual(
    [...requests].sort(),
    Object.keys(SPACE_WEATHER_FEEDS).sort(),
  );
  assert.equal(snapshot.solarWind.speedKms, 419);
  assert.equal(snapshot.sfi.value, 137);
});

test('slow feeds wait for their own cadence', async () => {
  const { source, requests, advance } = harness();
  await source.getSnapshot();
  requests.length = 0;
  advance(60_000);
  await source.getSnapshot();
  assert.deepEqual([...requests].sort(), ['kpNow', 'mag', 'wind', 'xray']);
  requests.length = 0;
  advance(60 * 60_000);
  await source.getSnapshot();
  assert.equal(requests.length, Object.keys(SPACE_WEATHER_FEEDS).length);
});

test('a failing feed costs only its own reading, and is retried next time', async () => {
  const failing = new Set(['xray']);
  const { source, requests } = harness({ failing });
  const snapshot = await source.getSnapshot();
  assert.equal(snapshot.xray, null);
  assert.equal(snapshot.solarWind.speedKms, 419);
  requests.length = 0;
  failing.clear();
  const recovered = await source.getSnapshot();
  assert.deepEqual(requests, ['xray']);
  assert.equal(recovered.xray.flareClass, 'C3.2');
});

test('the refresh fails only when no feed has ever answered', async () => {
  const { source } = harness({
    failing: new Set(Object.keys(SPACE_WEATHER_FEEDS)),
  });
  await assert.rejects(source.getSnapshot(), /SWPC HTTP 503/);
});

test('an aborted refresh rejects without caching', async () => {
  const { source } = harness();
  const controller = new AbortController();
  controller.abort(new Error('superseded'));
  await assert.rejects(
    source.getSnapshot({ signal: controller.signal }),
    /superseded/,
  );
});
