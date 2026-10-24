import fs from 'node:fs';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/**
 * Grow an image onto a larger canvas without rescaling.
 * The uncovered area is filled with a sentinel colour so that growth or
 * shrinkage registers as changed pixels in the diff instead of blending in.
 */
function pad(png, width, height, fill = [255, 0, 255, 255]) {
  if (png.width === width && png.height === height) return png;
  const out = new PNG({ width, height });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = fill[0];
    out.data[i + 1] = fill[1];
    out.data[i + 2] = fill[2];
    out.data[i + 3] = fill[3];
  }
  PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
  return out;
}

/**
 * Compare two PNG files on disk.
 * Always writes a diff image so the report can show it, even when identical.
 */
export function compareFiles(baselinePath, currentPath, diffPath, options = {}) {
  const threshold = options.threshold ?? 0.1;
  const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
  const current = PNG.sync.read(fs.readFileSync(currentPath));

  const width = Math.max(baseline.width, current.width);
  const height = Math.max(baseline.height, current.height);

  const a = pad(baseline, width, height);
  const b = pad(current, width, height);
  const out = new PNG({ width, height });

  const changed = pixelmatch(a.data, b.data, out.data, width, height, {
    threshold,
    includeAA: false,
    diffColor: [255, 0, 90],
    alpha: 0.15,
  });

  fs.writeFileSync(diffPath, PNG.sync.write(out));

  const sizeChanged =
    baseline.width !== current.width || baseline.height !== current.height;

  return {
    changed,
    total: width * height,
    ratio: changed / (width * height),
    sizeChanged,
    baselineSize: { width: baseline.width, height: baseline.height },
    currentSize: { width: current.width, height: current.height },
    width,
    height,
  };
}

/** Read just the dimensions of a PNG without diffing. */
export function imageSize(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  return { width: png.width, height: png.height };
}

/** Compare two in-memory RGBA buffers (used by tests). */
export function compareBuffers(a, b, options = {}) {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const pa = pad(a, width, height);
  const pb = pad(b, width, height);
  const out = new PNG({ width, height });
  const changed = pixelmatch(pa.data, pb.data, out.data, width, height, {
    threshold: options.threshold ?? 0.1,
    includeAA: false,
  });
  return { changed, total: width * height, ratio: changed / (width * height) };
}
