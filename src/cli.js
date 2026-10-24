#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig, writeDefaultConfig, CONFIG_FILENAME } from './config.js';
import { capture } from './capture.js';
import { compareFiles, imageSize } from './compare.js';
import { renderReport } from './report.js';
import { ensureDir, pct, readJson, writeJson } from './util.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = readJson(path.join(HERE, '..', 'package.json'), { version: '0.0.0' });

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = {
  dim: paint('2'),
  bold: paint('1'),
  green: paint('32'),
  red: paint('31'),
  yellow: paint('33'),
  cyan: paint('36'),
};

const HELP = `
${c.bold('doubletake')} ${c.dim('v' + PKG.version)} — catch unintended UI changes

${c.bold('Usage')}
  doubletake <command> [options]

${c.bold('Commands')}
  check              screenshot, compare against baselines, write a report
  update             same as check, then accept current shots as baselines
  init               create ${CONFIG_FILENAME}
  report             print the path to the latest report

${c.bold('Options')}
  -c, --config <p>   path to ${CONFIG_FILENAME}
      --no-color     disable color output
  -h, --help         show this help
  -v, --version      print version

${c.bold('Exit codes')}
  0  no unintended changes
  1  changed pages, or a capture error
`;

function parseArgs(argv) {
  const out = { command: 'check', flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') out.flags.help = true;
    else if (arg === '-v' || arg === '--version') out.flags.version = true;
    else if (arg === '--no-color') process.env.NO_COLOR = '1';
    else if (arg === '--update') out.flags.update = true;
    else if (arg === '-c' || arg === '--config') out.flags.config = argv[++i];
    else if (arg.startsWith('--config=')) out.flags.config = arg.slice('--config='.length);
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else out.command = arg;
  }
  return out;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function stateDirs(cfg) {
  const root = path.join(cfg.root, '.doubletake');
  return {
    root,
    baselines: path.join(root, 'baselines'),
    runs: path.join(root, 'runs'),
  };
}

/** Ignore run artifacts without touching the user's root .gitignore. */
function ensureStateFiles(dirs) {
  ensureDir(dirs.baselines);
  ensureDir(dirs.runs);
  const ignore = path.join(dirs.root, '.gitignore');
  if (!fs.existsSync(ignore)) {
    fs.writeFileSync(ignore, '# doubletake run artifacts — baselines are meant to be committed\nruns/\nlatest\n');
  }
}

function symbol(status) {
  if (status === 'pass') return c.green('✓');
  if (status === 'fail') return c.red('✗');
  if (status === 'new') return c.yellow('+');
  return c.red('!');
}

function describe(result) {
  if (result.status === 'new') return c.yellow('no baseline yet');
  if (result.status === 'error') return c.red('capture failed');
  if (result.status === 'pass') return c.dim('unchanged');
  const bits = [`${c.red(pct(result.ratio))} changed`];
  if (result.sizeChanged) {
    bits.push(c.dim(`${result.baseline.width}×${result.baseline.height} → ${result.current.width}×${result.current.height}`));
  }
  return bits.join(' ');
}

async function check(cfg, flags) {
  const dirs = stateDirs(cfg);
  ensureStateFiles(dirs);

  const runId = stamp();
  const runDir = path.join(dirs.runs, runId);
  ensureDir(runDir);

  process.stdout.write(`${c.dim('doubletake')} ${cfg.pages.length} pages × ${cfg.viewports.length} viewports\n`);

  let shots;
  try {
    shots = await capture(cfg, runDir);
  } catch (err) {
    const hint = /net::ERR|ENOTFOUND|ECONNREFUSED|Timeout/i.test(err.message)
      ? `\nIs your app running at ${cfg.baseUrl}?`
      : '';
    throw new Error(`Capture failed: ${err.message}${hint}`);
  }

  const results = [];
  const diffsDir = path.join(runDir, 'diffs');

  for (const shot of shots) {
    const currentPath = path.join(runDir, shot.file);
    const baselinePath = path.join(dirs.baselines, shot.file);
    const hasBaseline = fs.existsSync(baselinePath);

    if (!hasBaseline) {
      results.push({
        ...shot,
        status: 'new',
        ratio: 0,
        changed: 0,
        sizeChanged: false,
        baseline: null,
        current: imageSize(currentPath),
        diffFile: null,
      });
      continue;
    }

    ensureDir(diffsDir);
    const diffFile = path.join('diffs', shot.file);
    const cmp = compareFiles(baselinePath, currentPath, path.join(runDir, diffFile), {
      threshold: cfg.threshold,
    });

    const failed =
      cmp.ratio > cfg.maxDiffRatio || (cfg.failOnSizeChange && cmp.sizeChanged);

    results.push({
      ...shot,
      status: failed ? 'fail' : 'pass',
      ratio: cmp.ratio,
      changed: cmp.changed,
      sizeChanged: cmp.sizeChanged,
      baseline: cmp.baselineSize,
      current: cmp.currentSize,
      diffFile,
    });
  }

  const reportPath = renderReport(results, runDir, {
    generatedAt: new Date().toISOString(),
  });
  writeJson(path.join(dirs.root, 'latest.json'), { runId, reportPath, at: new Date().toISOString() });

  if (flags.update) {
    ensureDir(dirs.baselines);
    for (const result of results) {
      if (result.status === 'error') continue;
      fs.copyFileSync(path.join(runDir, result.file), path.join(dirs.baselines, result.file));
    }
    for (const result of results) result.status = 'pass';
    renderReport(results, runDir, { generatedAt: new Date().toISOString() });
  }

  const padLabel = Math.min(
    32,
    Math.max(...results.map((r) => r.name.length), 0),
  );

  process.stdout.write('\n');
  for (const result of results) {
    const label = result.name.padEnd(padLabel);
    const vp = result.viewport.padEnd(9);
    process.stdout.write(`  ${symbol(result.status)} ${label}  ${c.dim(vp)} ${describe(result)}\n`);
  }

  const changed = results.filter((r) => r.status === 'fail').length;
  const fresh = results.filter((r) => r.status === 'new').length;
  const unchanged = results.filter((r) => r.status === 'pass').length;

  process.stdout.write('\n');
  if (flags.update) {
    process.stdout.write(`${c.green('baselines updated')} ${c.dim(`(${results.length} shots)`)}\n`);
  } else if (changed > 0) {
    process.stdout.write(
      `${c.red(`${changed} changed`)} · ${unchanged} unchanged${fresh ? ` · ${fresh} new` : ''}\n`,
    );
    process.stdout.write(
      `${c.dim('review:')} ${path.relative(cfg.root, reportPath)}\n` +
        `${c.dim('accept:')} doubletake update\n`,
    );
  } else if (fresh > 0) {
    process.stdout.write(
      `${c.yellow(`${fresh} new`)} · ${unchanged} unchanged ${c.dim('— commit .doubletake/baselines to lock them in')}\n`,
    );
  } else {
    process.stdout.write(`${c.green('all clear')} · ${unchanged} shots unchanged\n`);
  }

  return flags.update || changed === 0 ? 0 : 1;
}

function init(cfgPath) {
  const dir = cfgPath ? path.dirname(path.resolve(cfgPath)) : process.cwd();
  ensureDir(dir);
  const file = writeDefaultConfig(dir);
  const dirs = stateDirs({ root: dir });
  ensureStateFiles(dirs);
  process.stdout.write(`${c.green('created')} ${path.relative(process.cwd(), file) || file}\n`);
  process.stdout.write(`${c.dim('next:')} start your app, then run ${c.bold('doubletake check')}\n`);
  return 0;
}

function latestReport() {
  const state = readJson(path.join(process.cwd(), '.doubletake', 'latest.json'));
  if (!state?.reportPath || !fs.existsSync(state.reportPath)) {
    throw new Error('No report yet. Run "doubletake check" first.');
  }
  return state.reportPath;
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (flags.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (flags.version) {
    process.stdout.write(PKG.version + '\n');
    return 0;
  }

  if (command === 'init') return init(flags.config);

  if (command === 'report') {
    const p = latestReport();
    process.stdout.write(p + '\n');
    if (process.stdout.isTTY && !process.env.NO_OPEN && os.platform() !== 'linux') {
      const { execFile } = await import('node:child_process');
      const opener = os.platform() === 'darwin' ? 'open' : 'explorer';
      execFile(opener, [p], () => {});
    }
    return 0;
  }

  if (command === 'check' || command === 'update') {
    const cfg = loadConfig(flags.config);
    return check(cfg, { ...flags, update: command === 'update' || flags.update });
  }

  throw new Error(`Unknown command: ${command}\nRun "doubletake --help".`);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`\n${c.red('error')} ${err.message}\n`);
    process.exitCode = 1;
  });
