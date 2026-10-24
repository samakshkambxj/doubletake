import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadConfig, writeDefaultConfig, CONFIG_FILENAME } from '../src/config.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'doubletake-'));
}

function writeConfig(dir, config) {
  fs.writeFileSync(path.join(dir, CONFIG_FILENAME), JSON.stringify(config));
}

test('applies defaults for omitted keys', () => {
  const dir = tempDir();
  writeConfig(dir, { baseUrl: 'http://x.test', pages: ['/'], viewports: [[1280, 800]] });

  const cfg = loadConfig(null, dir);

  assert.equal(cfg.baseUrl, 'http://x.test');
  assert.equal(cfg.fullPage, true);
  assert.equal(cfg.maxDiffRatio, 0.002);
  assert.equal(cfg.threshold, 0.1);
  assert.equal(cfg.root, dir);
});

test('normalises string pages and tuple viewports', () => {
  const dir = tempDir();
  writeConfig(dir, {
    baseUrl: 'http://x.test',
    pages: ['/', { path: '/pricing' }],
    viewports: [[390, 844], { width: 1280, height: 800, name: 'desktop' }],
  });

  const cfg = loadConfig(null, dir);

  assert.deepEqual(
    cfg.pages.map((p) => p.path),
    ['/', '/pricing'],
  );
  assert.equal(cfg.pages[0].name, '/');
  assert.deepEqual(
    cfg.viewports.map((v) => v.name),
    ['390x844', 'desktop'],
  );
});

test('strips a trailing slash from baseUrl', () => {
  const dir = tempDir();
  writeConfig(dir, { baseUrl: 'http://x.test/', pages: ['/'], viewports: [[1, 1]] });

  assert.equal(loadConfig(null, dir).baseUrl, 'http://x.test');
});

test('rejects an empty pages array', () => {
  const dir = tempDir();
  writeConfig(dir, { pages: [], viewports: [[1, 1]] });

  assert.throws(() => loadConfig(null, dir), /pages" must be a non-empty array/);
});

test('rejects a page without a path or url', () => {
  const dir = tempDir();
  writeConfig(dir, { pages: [{ name: 'x' }], viewports: [[1, 1]] });

  assert.throws(() => loadConfig(null, dir), /needs a "path" or "url"/);
});

test('explains how to create a missing config', () => {
  const dir = tempDir();
  assert.throws(() => loadConfig(null, dir), /doubletake init/);
});

test('init writes a config that loads back', () => {
  const dir = tempDir();
  const file = writeDefaultConfig(dir);

  assert.ok(fs.existsSync(file));
  const cfg = loadConfig(null, dir);
  assert.equal(cfg.pages.length, 2);
  assert.equal(cfg.viewports.length, 2);
});

test('init refuses to overwrite an existing config', () => {
  const dir = tempDir();
  writeDefaultConfig(dir);
  assert.throws(() => writeDefaultConfig(dir), /already exists/);
});
