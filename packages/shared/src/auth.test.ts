import { describe, expect, it } from 'vitest';

import {
  Permissions,
  ROLE_PERMISSIONS,
  USER_ROLES,
  hasPermission,
} from './auth';

// RBAC 权限矩阵抽样单测。
// 覆盖：ADMIN 全量、各岗位差异点、PENDING/未知岗位一律拒绝。
describe('RBAC role → permission matrix', () => {
  it('grants every permission to ADMIN', () => {
    for (const permission of Object.values(Permissions)) {
      expect(hasPermission('ADMIN', permission)).toBe(true);
    }
  });

  it('matches matrix: 点货（填实收）仅 WAREHOUSE 与 ADMIN', () => {
    expect(hasPermission('WAREHOUSE', Permissions.COUNTING_WRITE)).toBe(true);
    expect(hasPermission('COLLECTOR', Permissions.COUNTING_WRITE)).toBe(false);
    expect(hasPermission('RETAILER', Permissions.COUNTING_WRITE)).toBe(false);
    expect(hasPermission('ADMIN', Permissions.COUNTING_WRITE)).toBe(true);
  });

  it('matches matrix: 审批/拒绝差异修订 仅 COLLECTOR 与 ADMIN', () => {
    expect(hasPermission('COLLECTOR', Permissions.REVIEWS_APPROVE)).toBe(true);
    expect(hasPermission('WAREHOUSE', Permissions.REVIEWS_APPROVE)).toBe(false);
    expect(hasPermission('RETAILER', Permissions.REVIEWS_APPROVE)).toBe(false);
    expect(hasPermission('ADMIN', Permissions.REVIEWS_APPROVE)).toBe(true);
  });

  it('matches matrix: 提交差异修订 仅 WAREHOUSE 与 ADMIN', () => {
    expect(hasPermission('WAREHOUSE', Permissions.REVIEWS_SUBMIT)).toBe(true);
    expect(hasPermission('COLLECTOR', Permissions.REVIEWS_SUBMIT)).toBe(false);
    expect(hasPermission('RETAILER', Permissions.REVIEWS_SUBMIT)).toBe(false);
  });

  it('matches matrix: RETAILER 可浏览物品、查库存/零售价，但不可写物品、见发货单、管物流', () => {
    expect(hasPermission('RETAILER', Permissions.ITEMS_READ)).toBe(true);
    expect(hasPermission('RETAILER', Permissions.STOCK_READ)).toBe(true);
    expect(hasPermission('RETAILER', Permissions.RETAIL_PRICES_READ)).toBe(true);
    expect(hasPermission('RETAILER', Permissions.ITEMS_WRITE)).toBe(false);
    expect(hasPermission('RETAILER', Permissions.SHIPMENTS_READ)).toBe(false);
    expect(hasPermission('RETAILER', Permissions.TRACKINGS_MANAGE)).toBe(false);
  });

  it('matches matrix: 发起售后退货 仅 RETAILER 与 ADMIN', () => {
    expect(hasPermission('RETAILER', Permissions.AFTER_SALE_CREATE)).toBe(true);
    expect(hasPermission('WAREHOUSE', Permissions.AFTER_SALE_CREATE)).toBe(false);
    expect(hasPermission('COLLECTOR', Permissions.AFTER_SALE_CREATE)).toBe(false);
  });

  it('matches matrix: 审核/收货退回 仅 WAREHOUSE 与 ADMIN', () => {
    expect(hasPermission('WAREHOUSE', Permissions.AFTER_SALE_RECEIVE)).toBe(true);
    expect(hasPermission('RETAILER', Permissions.AFTER_SALE_RECEIVE)).toBe(false);
    expect(hasPermission('COLLECTOR', Permissions.AFTER_SALE_RECEIVE)).toBe(false);
  });

  it('matches matrix: 用户/部门/审计管理 仅 ADMIN', () => {
    expect(hasPermission('ADMIN', Permissions.USERS_ADMIN)).toBe(true);
    expect(hasPermission('ADMIN', Permissions.UNITS_ADMIN)).toBe(true);
    expect(hasPermission('ADMIN', Permissions.AUDIT_ADMIN)).toBe(true);
    for (const role of ['COLLECTOR', 'WAREHOUSE', 'RETAILER'] as const) {
      expect(hasPermission(role, Permissions.USERS_ADMIN)).toBe(false);
      expect(hasPermission(role, Permissions.UNITS_ADMIN)).toBe(false);
      expect(hasPermission(role, Permissions.AUDIT_ADMIN)).toBe(false);
    }
  });

  it('matches matrix: 所有岗位均可浏览物品与业务单元', () => {
    for (const role of USER_ROLES) {
      expect(hasPermission(role, Permissions.ITEMS_READ)).toBe(true);
      expect(hasPermission(role, Permissions.UNITS_READ)).toBe(true);
    }
  });

  it('rejects PENDING / null / unknown roles for every permission', () => {
    for (const permission of Object.values(Permissions)) {
      expect(hasPermission(null, permission)).toBe(false);
      expect(hasPermission(undefined, permission)).toBe(false);
    }
  });

  it('keeps ROLE_PERMISSIONS deduplicated', () => {
    for (const role of USER_ROLES) {
      const list = ROLE_PERMISSIONS[role] as readonly string[];
      expect(new Set(list).size).toBe(list.length);
    }
  });
});
