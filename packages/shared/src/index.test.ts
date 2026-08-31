import { describe, expect, it } from 'vitest';
import { API_BASE_PATH, APP_NAME } from './constants';
import { ErrorCodes } from './errors';

describe('packages/shared placeholder', () => {
  it('exports app constants', () => {
    expect(APP_NAME).toBe('OtunLink');
    expect(API_BASE_PATH).toBe('/api/v1');
  });

  it('exports error codes', () => {
    expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ErrorCodes.CONFLICT).toBe('CONFLICT');
  });
});
