import test from 'node:test';
import assert from 'node:assert/strict';
import { createSwpcDrapSource } from './source.js';
import { createOvationAuroraSource } from '../aurora/source.js';

test('the D-RAP and OVATION sources read SWPC and reject what they cannot parse', async () => {
  const urls = [];
  const drap = createSwpcDrapSource({
    fetchImpl: async (url) => {
      urls.push(url);
      return new Response('# not a table');
    },
  });
  await assert.rejects(drap.getSnapshot(), /Malformed D-RAP response/);
  const aurora = createOvationAuroraSource({
    fetchImpl: async (url) => {
      urls.push(url);
      return new Response('', { status: 503 });
    },
  });
  await assert.rejects(aurora.getSnapshot(), /SWPC HTTP 503/);
  assert.deepEqual(urls, [
    'https://services.swpc.noaa.gov/text/drap_global_frequencies.txt',
    'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
  ]);
});
