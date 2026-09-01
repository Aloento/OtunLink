import { describe, expect, it } from 'vitest';
import { APP_NAME } from '@otunlink/shared';

describe('apps/web workspace link', () => {
  it('links the shared workspace package', () => {
    expect(APP_NAME).toBe('OtunLink');
  });
});
