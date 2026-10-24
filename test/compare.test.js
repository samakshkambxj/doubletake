import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';

import { compareBuffers, compareFiles, imageSize } from '../src/compare.js';

function blank(width, height, [r, g, b, a] = [255, 255, 255, 255]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = a;
  }
  return png;
}

test('identical images report zero changed pixels', () => {
  const a = blank(20, 10);
  const b = blank(20, 10);

  const result = compareBuffers(a, b);

  assert.equal(result.changed, 0);
  assert.equal(result.ratio, 0);
  assert.equal(result.total, 200);
});

test('counts a single changed pixel', () => {
  const a = blank(10, 10);
  const b = blank(10, 10);
  b.data[0] = 0;
  b.data[1] = 0;
  b.data[2] = 0;

  const result = compareBuffers(a, b);

  assert.equal(result.changed, 1);
  assert.equal(result.ratio, 0.01);
});

test('a changed image is a larger ratio than a subtle change', () => {
  const base = blank(40, 40);
  const subtle = blank(40, 40);
  subtle.data[0] = 0;

  const loud = blank(40, 40, [0, 0, 0, 255]);

  assert.ok(compareBuffers(base, subtle).ratio < compareBuffers(base, loud).ratio);
});

test('pads a smaller image so size changes register as differences', () => {
  const small = blank(10, 10);
  const large = blank(20, 20);

  const result = compareBuffers(small, large);

  assert.equal(result.total, 400);
  assert.ok(result.changed >= 300, `expected most of the canvas to differ, got ${result.changed}`);
});

test('compareFiles writes a diff image and flags the size change', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doubletake-cmp-'));
  const baseline = path.join(dir, 'a.png');
  const current = path.join(dir, 'b.png');
  const diff = path.join(dir, 'diff.png');

  fs.writeFileSync(baseline, PNG.sync.write(blank(10, 10)));
  fs.writeFileSync(current, PNG.sync.write(blank(10, 20)));

  const result = compareFiles(baseline, current, diff);

  assert.ok(fs.existsSync(diff));
  assert.equal(result.sizeChanged, true);
  assert.deepEqual(result.baselineSize, { width: 10, height: 10 });
  assert.deepEqual(result.currentSize, { width: 10, height: 20 });
  assert.ok(result.ratio > 0);
});

test('imageSize reads dimensions without diffing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doubletake-size-'));
  const file = path.join(dir, 'a.png');
  fs.writeFileSync(file, PNG.sync.write(blank(7, 3)));

  assert.deepEqual(imageSize(file), { width: 7, height: 3 });
});
