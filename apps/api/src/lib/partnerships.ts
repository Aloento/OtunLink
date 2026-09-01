import type { Context } from 'hono';

import { unitScopeFilter } from '../auth/middleware';
import type { AppEnv, Repos } from '../types';

/**
 * 读取某零售门店已签约的仓库 unit id 集合。
 * 供 stock / retail-prices / sales-orders / dashboard 复用。
 */
export async function loadPartnerWarehouseIds(
  repos: Repos,
  retailerUnitId: string,
): Promise<string[]> {
  return repos.partnerships.listWarehouseIds(retailerUnitId);
}

export interface PartnerWarehouseScope {
  /** 显式指定了未签约仓库（越界），调用方应返回 404 避免泄露存在性。 */
  denied?: boolean;
  unitId?: string;
  unitIds?: string[];
}

/**
 * 计算仓库维度过滤：
 * - RETAILER：显式 unitId 必须 ∈ 已签约仓库（否则 denied）；未指定 → 已签约集合（可能为空）。
 * - 其它角色：{ unitId: explicitUnitId ?? scope?.unitId }（保留原行为）。
 */
export async function resolvePartnerWarehouseScope(
  c: Context<AppEnv>,
  repos: Repos,
  explicitUnitId?: string,
): Promise<PartnerWarehouseScope> {
  const user = c.get('auth').user;
  if (user?.role !== 'RETAILER') {
    const scope = unitScopeFilter(c.get('auth'));
    return { unitId: explicitUnitId ?? scope?.unitId };
  }

  const partnerIds = await loadPartnerWarehouseIds(repos, user.scopeUnitId!);
  if (explicitUnitId) {
    return partnerIds.includes(explicitUnitId) ? { unitId: explicitUnitId } : { denied: true };
  }
  return { unitIds: partnerIds };
}
