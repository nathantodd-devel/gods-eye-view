import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIDENHEAD_SQUARE_HEIGHT_M, maidenheadGridLines } from './model.js';

test('from afar the grid is the 18 × 18 fields', () => {
  const { level, lines } = maidenheadGridLines(null, 20_000_000);
  assert.equal(level, 'field');
  assert.equal(lines.filter(({ kind }) => kind === 'meridian').length, 18);
  assert.equal(lines.filter(({ kind }) => kind === 'parallel').length, 17);
  assert.ok(lines.every(({ major }) => major));
  // A ground meridian reaching 87° or more stops Cesium's renderer.
  for (const { points } of lines)
    assert.ok(points.every(([, lat]) => Math.abs(lat) <= 85));
});

test('a polar view stops its squares short of the pole', () => {
  const view = { west: -10, south: 82.2, east: 10, north: 90 };
  const { level, lines } = maidenheadGridLines(view, 500_000);
  assert.equal(level, 'square');
  for (const { points } of lines)
    assert.ok(points.every(([, lat]) => Math.abs(lat) <= 85));
});

test('up close the view gets its 2° × 1° squares, field edges marked major', () => {
  const view = { west: -75.5, south: 40.2, east: -70.1, north: 43.9 };
  const { level, lines } = maidenheadGridLines(
    view,
    MAIDENHEAD_SQUARE_HEIGHT_M / 4,
  );
  assert.equal(level, 'square');
  const meridians = lines.filter(({ kind }) => kind === 'meridian');
  assert.deepEqual(
    meridians.map(({ points }) => points[0][0]),
    [-76, -74, -72, -70],
  );
  assert.deepEqual(
    meridians.filter(({ major }) => major).map(({ points }) => points[0][0]),
    [],
  );
  const parallels = lines.filter(({ kind }) => kind === 'parallel');
  assert.deepEqual(
    parallels.map(({ points }) => points[0][1]),
    [40, 41, 42, 43, 44],
  );
  assert.equal(parallels.find(({ points }) => points[0][1] === 40).major, true);
});

test('a view across the antimeridian keeps its lines short', () => {
  const view = { west: 178.5, south: -18.5, east: -178.5, north: -16.2 };
  const { lines } = maidenheadGridLines(view, 500_000);
  const meridians = lines.filter(({ kind }) => kind === 'meridian');
  assert.deepEqual(
    meridians.map(({ id }) => id),
    ['square-lon:178', 'square-lon:-180', 'square-lon:-178'],
  );
  const parallel = lines.find(({ kind }) => kind === 'parallel');
  assert.ok(parallel.points.at(-1)[0] - parallel.points[0][0] <= 6);
});

test('a square-level view too wide for the line budget falls back to fields', () => {
  const view = { west: -170, south: -60, east: 170, north: 60 };
  assert.equal(maidenheadGridLines(view, 1_000_000).level, 'field');
});
