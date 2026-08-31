import { describe, expect, it } from 'vitest';
import { schema } from './schema';

describe('packages/db placeholder', () => {
  it('exports an empty schema placeholder', () => {
    expect(schema).toBeDefined();
  });
});
