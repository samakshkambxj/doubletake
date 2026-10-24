import path from 'node:path';
import { slug, ensureDir } from './util.js';

function targetUrl(cfg, page) {
  if (page.url) return page.url;
  return new URL(page.path, cfg.baseUrl + '/').toString();
}

/**
 * Screenshot every page at every viewport into `outDir`.
 * Returns metadata for each shot so the comparer knows what to look at.
 */
export async function capture(cfg, outDir) {
  const { chromium } = await import('playwright');
  ensureDir(outDir);

  const shots = [];
  const browser = await chromium.launch();

  try {
    for (const viewport of cfg.viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: cfg.deviceScaleFactor,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(cfg.timeout);

      for (const entry of cfg.pages) {
        const url = targetUrl(cfg, entry);
        const file = `${slug(entry.name)}__${slug(viewport.name)}.png`;
        const filepath = path.join(outDir, file);

        await page.goto(url, { waitUntil: 'networkidle' });

        if (cfg.waitFor > 0) {
          await page.waitForTimeout(cfg.waitFor);
        }

        const options = {
          path: filepath,
          animations: 'disabled',
          caret: 'hide',
          scale: 'css',
        };

        if (cfg.selector) {
          await page.locator(cfg.selector).first().screenshot(options);
        } else {
          await page.screenshot({ ...options, fullPage: cfg.fullPage });
        }

        shots.push({
          name: entry.name,
          viewport: viewport.name,
          width: viewport.width,
          height: viewport.height,
          url,
          file,
        });
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  return shots;
}
