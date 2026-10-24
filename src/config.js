import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_FILENAME = 'doubletake.config.json';

const DEFAULTS = {
  baseUrl: 'http://localhost:3000',
  pages: [{ name: 'home', path: '/' }],
  viewports: [{ name: 'desktop', width: 1280, height: 800 }],
  fullPage: true,
  selector: null,
  waitFor: 250,
  timeout: 30000,
  threshold: 0.1,
  maxDiffRatio: 0.002,
  failOnSizeChange: true,
  deviceScaleFactor: 1,
};

export function resolveConfigPath(explicit, cwd = process.cwd()) {
  if (explicit) {
    const abs = path.resolve(cwd, explicit);
    if (!fs.existsSync(abs)) {
      throw new Error(`Config not found: ${abs}`);
    }
    return abs;
  }
  const abs = path.join(cwd, CONFIG_FILENAME);
  if (!fs.existsSync(abs)) {
    throw new Error(
      `No ${CONFIG_FILENAME} found in ${cwd}.\n` +
        `Run "doubletake init" to create one.`,
    );
  }
  return abs;
}

export function loadConfig(explicit, cwd = process.cwd()) {
  const configPath = resolveConfigPath(explicit, cwd);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw new Error(`Could not parse ${configPath}: ${err.message}`);
  }

  const cfg = { ...DEFAULTS, ...raw };
  cfg.root = path.dirname(configPath);
  cfg.configPath = configPath;

  if (!Array.isArray(cfg.pages) || cfg.pages.length === 0) {
    throw new Error('Config error: "pages" must be a non-empty array.');
  }
  if (!Array.isArray(cfg.viewports) || cfg.viewports.length === 0) {
    throw new Error('Config error: "viewports" must be a non-empty array.');
  }

  // Normalise shorthands: pages may be a string path, viewports may be [w, h].
  cfg.pages = cfg.pages.map((page, i) => {
    const p = typeof page === 'string' ? { path: page } : page;
    if (!p.path && !p.url) {
      throw new Error(`Config error: pages[${i}] needs a "path" or "url".`);
    }
    return { name: p.name || p.path || p.url, ...p };
  });

  cfg.viewports = cfg.viewports.map((vp, i) => {
    if (Array.isArray(vp)) {
      return { name: `${vp[0]}x${vp[1]}`, width: vp[0], height: vp[1] };
    }
    if (!vp.width || !vp.height) {
      throw new Error(`Config error: viewports[${i}] needs "width" and "height".`);
    }
    return { name: vp.name || `${vp.width}x${vp.height}`, ...vp };
  });

  cfg.baseUrl = cfg.baseUrl.replace(/\/$/, '');
  return cfg;
}

export function writeDefaultConfig(targetDir, overrides = {}) {
  const config = {
    baseUrl: 'http://localhost:3000',
    pages: [
      { name: 'home', path: '/' },
      { name: 'pricing', path: '/pricing' },
    ],
    viewports: [
      { name: 'desktop', width: 1280, height: 800 },
      { name: 'mobile', width: 390, height: 844 },
    ],
    fullPage: true,
    waitFor: 250,
    maxDiffRatio: 0.002,
    failOnSizeChange: true,
    ...overrides,
  };
  const file = path.join(targetDir, CONFIG_FILENAME);
  if (fs.existsSync(file)) {
    throw new Error(`${file} already exists.`);
  }
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  return file;
}
