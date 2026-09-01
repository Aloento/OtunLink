import { describe, expect, it } from 'vitest';

import { isGtin } from './gtin';

describe('isGtin', () => {
  it('accepts a valid EAN-8', () => {
    expect(isGtin('40063812')).toBe(true);
  });

  it('accepts a valid UPC-A (12 digits)', () => {
    expect(isGtin('036000291452')).toBe(true);
  });

  it('accepts a valid EAN-13', () => {
    expect(isGtin('4006381333931')).toBe(true);
  });

  it('accepts a valid GTIN-14', () => {
    expect(isGtin('10012345678902')).toBe(true);
  });

  it('rejects an empty value', () => {
    expect(isGtin('')).toBe(false);
  });

  it('rejects non-digit characters', () => {
    expect(isGtin('4006381a')).toBe(false);
  });

  it('rejects unsupported lengths', () => {
    expect(isGtin('1234567')).toBe(false);
    expect(isGtin('123456789')).toBe(false);
    expect(isGtin('12345678901')).toBe(false);
    expect(isGtin('123456789012345')).toBe(false);
  });

  it('rejects an incorrect check digit', () => {
    expect(isGtin('4006381333932')).toBe(false);
    expect(isGtin('40063813')).toBe(false);
  });
});
