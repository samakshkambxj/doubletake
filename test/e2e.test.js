import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'src', 'cli.js');

const PAGE = (heading, colour) => `<!doctype html><html><body style="margin:0;background:${colour}">
<h1 style="font:600 28px sans-serif;padding:24px">${heading}</h1></body></html>`;

function serve() {
  let body = PAGE('Baseline page', '#ffffff');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        set: (html) => {
          body = html;
        },
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

async function cli(args, cwd) {
  try {
    const { stdout } = await exec(process.execPath, [CLI, ...args], { cwd });
    return { code: 0, out: stdout };
  } catch (err) {
    return { code: err.code, out: (err.stdout || '') + (err.stderr || '') };
  }
}

test('full cycle: accept baselines, pass, then fail on a real change', { timeout: 180_000 }, async (t) => {
  const site = await serve();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doubletake-e2e-'));
  t.after(() => site.close());

  fs.writeFileSync(
    path.join(dir, 'doubletake.config.json'),
    JSON.stringify({
      baseUrl: site.url,
      pages: [{ name: 'home', path: '/' }],
      viewports: [{ name: 'mobile', width: 320, height: 200 }],
      fullPage: false,
      waitFor: 0,
    }),
  );

  const accepted = await cli(['update'], dir);
  assert.equal(accepted.code, 0, accepted.out);
  assert.match(accepted.out, /baselines updated/);

  const baseline = path.join(dir, '.doubletake', 'baselines', 'home__mobile.png');
  assert.ok(fs.existsSync(baseline), 'baseline should be written');

  const clean = await cli(['check'], dir);
  assert.equal(clean.code, 0, clean.out);
  assert.match(clean.out, /all clear/);

  site.set(PAGE('Baseline page', '#123456'));

  const dirty = await cli(['check'], dir);
  assert.equal(dirty.code, 1, 'a changed page must fail the build');
  assert.match(dirty.out, /changed/);

  const run = JSON.parse(
    fs.readFileSync(path.join(dir, '.doubletake', 'latest.json'), 'utf8'),
  );
  assert.ok(fs.existsSync(run.reportPath), 'report should be written');
  const html = fs.readFileSync(run.reportPath, 'utf8');
  assert.match(html, /\.\.\/\.\.\/baselines\/home__mobile\.png/);
  assert.match(html, /diffs\/home__mobile\.png/);
  assert.ok(fs.existsSync(path.dirname(run.reportPath) + '/diffs/home__mobile.png'));

  // Accepting the change must flip the verdict back to passing.
  const acceptedAgain = await cli(['update'], dir);
  assert.equal(acceptedAgain.code, 0, acceptedAgain.out);

  const afterAccept = await cli(['check'], dir);
  assert.equal(afterAccept.code, 0, afterAccept.out);
  assert.match(afterAccept.out, /all clear/);
});
