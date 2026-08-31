import { describe, expect, it } from 'vitest';
import { migrations, schema } from './index';

const REQUIRED_TABLES = [
  'businessUnits',
  'users',
  'items',
  'itemImages',
  'files',
  'shipments',
  'shipmentTrackings',
  'shipmentItems',
  'discrepancyReviews',
  'discrepancyReviewItems',
  'batches',
  'inboundOrders',
  'inboundOrderItems',
  'outboundOrders',
  'outboundOrderItems',
  'returnOrders',
  'returnOrderItems',
  'salesOrders',
  'salesOrderItems',
  'salesBatchAllocations',
  'payments',
  'stock',
  'stockMovements',
  'retailPrices',
  'retailPriceHistory',
  'notifications',
  'auditLogs',
  'emailLogs',
] as const;

describe('@otunlink/db schema', () => {
  it('exports every table required by design.md §7', () => {
    const tables = schema as unknown as Record<string, unknown>;
    for (const name of REQUIRED_TABLES) {
      expect(tables[name], `missing table: ${name}`).toBeDefined();
    }
  });

  it('exposes the embedded migrations snapshot', () => {
    expect(Array.isArray(migrations)).toBe(true);
  });
});
