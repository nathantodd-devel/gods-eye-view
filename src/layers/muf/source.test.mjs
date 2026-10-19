import test from 'node:test';
import assert from 'node:assert/strict';
import { createKc2gMufSource } from './source.js';

const geojson = {
  features: [
    {
      properties: { 'level-value': 14, stroke: '#007458' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [10, 10],
        ],
      },
    },
  ],
};

test('the map time comes from Last-Modified', async () => {
  const urls = [];
  const source = createKc2gMufSource({
    fetchImpl: async (url) => {
      urls.push(url);
      return new Response(JSON.stringify(geojson), {
        headers: { 'Last-Modified': 'Sun, 18 Oct 2026 22:40:46 GMT' },
      });
    },
  });
  const snapshot = await source.getSnapshot();
  assert.deepEqual(urls, [
    'https://prop.kc2g.com/renders/current/mufd-normal-now.geojson',
  ]);
  assert.equal(snapshot.renderedMs, Date.parse('2026-10-18T22:40:46Z'));
  assert.equal(snapshot.lines.length, 1);
});

test('HTTP failures and malformed maps reject', async () => {
  const failing = createKc2gMufSource({
    fetchImpl: async () => new Response('', { status: 502 }),
  });
  await assert.rejects(failing.getSnapshot(), /KC2G HTTP 502/);
  const malformed = createKc2gMufSource({
    fetchImpl: async () => new Response('{"nope":1}'),
  });
  await assert.rejects(malformed.getSnapshot(), /Malformed MUF response/);
});
