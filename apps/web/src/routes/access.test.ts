import { Permissions } from '@otunlink/shared';
import { describe, expect, it } from 'vitest';

import { canAccessPermissions } from './access';

describe('canAccessPermissions', () => {
  it('allows empty permission lists for any role, including unassigned', () => {
    expect(canAccessPermissions(null, [])).toBe(true);
    expect(canAccessPermissions('RETAILER', [])).toBe(true);
  });

  it('uses OR semantics: any single matching permission grants access', () => {
    expect(canAccessPermissions('COLLECTOR', [Permissions.SHIPMENTS_READ])).toBe(true);
    expect(canAccessPermissions('RETAILER', [Permissions.SHIPMENTS_READ])).toBe(true);
    expect(
      canAccessPermissions('RETAILER', [Permissions.INBOUND_CONFIRM, Permissions.SALES_REQUEST]),
    ).toBe(true);
    expect(
      canAccessPermissions('COLLECTOR', [
        Permissions.SHIPMENT_RETURNS_CREATE,
        Permissions.SHIPMENT_RETURNS_HANDLE,
        Permissions.AFTER_SALE_CREATE,
      ]),
    ).toBe(true);
  });

  it('denies when no permission matches', () => {
    expect(canAccessPermissions('COLLECTOR', [Permissions.INBOUND_CONFIRM])).toBe(false);
    expect(canAccessPermissions('WAREHOUSE', [Permissions.USERS_ADMIN])).toBe(false);
    expect(canAccessPermissions('RETAILER', [Permissions.UNITS_ADMIN])).toBe(false);
    expect(canAccessPermissions(null, [Permissions.ITEMS_READ])).toBe(false);
    expect(canAccessPermissions(undefined, [Permissions.ITEMS_READ])).toBe(false);
  });

  it('grants ADMIN every permission', () => {
    expect(
      canAccessPermissions('ADMIN', [Permissions.USERS_ADMIN, Permissions.UNITS_ADMIN]),
    ).toBe(true);
  });
});
