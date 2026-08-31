import { describe, expect, it } from 'vitest';

import {
  computeTargetDimensions,
  DEFAULT_MAX_BYTES,
  suggestJpegQuality,
} from './image-compress';

describe('computeTargetDimensions', () => {
  it('keeps small images unchanged', () => {
    expect(computeTargetDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('scales by longest edge and keeps aspect ratio', () => {
    expect(computeTargetDimensions(4000, 2000, 1600)).toEqual({ width: 1600, height: 800 });
  });

  it('scales portrait images by height', () => {
    expect(computeTargetDimensions(1000, 3200, 1600)).toEqual({ width: 500, height: 1600 });
  });

  it('never returns zero dimensions', () => {
    expect(computeTargetDimensions(1, 0, 1600)).toEqual({ width: 1, height: 1 });
    expect(computeTargetDimensions(0, 0, 1600)).toEqual({ width: 1, height: 1 });
  });
});

describe('suggestJpegQuality', () => {
  it('starts at qualityStart when already under target', () => {
    expect(suggestJpegQuality(1_000_000, DEFAULT_MAX_BYTES)).toBe(0.92);
  });

  it('lowers quality for oversized inputs', () => {
    const q = suggestJpegQuality(8 * 1024 * 1024, DEFAULT_MAX_BYTES);
    expect(q).toBeLessThan(0.92);
    expect(q).toBeGreaterThanOrEqual(0.5);
  });

  it('respects the quality floor', () => {
    const q = suggestJpegQuality(64 * 1024 * 1024, DEFAULT_MAX_BYTES);
    expect(q).toBe(0.5);
  });
});
