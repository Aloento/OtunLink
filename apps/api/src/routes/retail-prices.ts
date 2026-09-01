import { Permissions, retailPricePutSchema, type UserRole } from '@otunlink/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';

import { requirePermission, requireUnitScopeAssigned, unitScopeFilter } from '../auth/middleware';
import { retailPriceDto, retailPriceHistoryDto } from '../lib/dto';
import { dbUnavailable, forbidden, notFound, ok, validationError } from '../lib/http';
import { recordAudit } from '../lib/audit';
import { resolvePartnerWarehouseScope } from '../lib/partnerships';
import type { AppEnv } from '../types';

// 零售价管理（design.md §4.2 retail_prices）：仓库 × 物品当前价 + 历史。
// 权限：读 = RETAIL_PRICES_READ，写 = RETAIL_PRICES_WRITE（WAREHOUSE/ADMIN）。
// 入库原价 unit_cost 只读（接口不接受该字段），历史由本接口改写时自动记录。
export function retailPricesRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  const read = requirePermission(Permissions.RETAIL_PRICES_READ);
  const write = requirePermission(Permissions.RETAIL_PRICES_WRITE);

  // 非 ADMIN 必须绑定业务单元才能访问业务数据（ADMIN 空 scope = 全量）。
  router.use('*', requireUnitScopeAssigned());

  router.get('/', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const unitId = c.req.query('unitId')?.trim() ?? undefined;
    const itemId = c.req.query('itemId')?.trim() ?? undefined;

    // RETAILER 仅可见已签约仓库；其它角色按 scope 收敛。
    const scope = await resolvePartnerWarehouseScope(c, repos, unitId);
    if (scope.denied) return notFound(c, '仓库不存在或未与您的门店签约');

    const items = await repos.retailPrices.list({
      unitId: scope.unitId,
      unitIds: scope.unitIds,
      itemId: itemId || undefined,
    });
    const hideCost = c.get('auth').user?.role === 'RETAILER';
    return ok(c, { items: items.map((row) => retailPriceDto(row, { hideCost })) });
  });

  router.put('/', write, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');

    const parsed = retailPricePutSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());
    const input = parsed.data;

    if (!writeScopeAllows(c.get('auth').user?.role ?? null, c.get('auth').user?.scopeUnitId ?? null, input.unitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    const [unit, item] = await Promise.all([
      repos.units.findById(input.unitId),
      repos.items.findById(input.itemId),
    ]);
    if (!unit || unit.type !== 'WAREHOUSE') {
      return validationError(c, '仓库不存在或不是仓库类型', { unitId: input.unitId });
    }
    if (!item) return notFound(c, '物品不存在');

    const [record, current] = await Promise.all([
      repos.retailPrices.setPrice({
        unitId: input.unitId,
        itemId: input.itemId,
        price: input.price,
        currency: input.currency ?? 'CNY',
        updatedBy: c.get('auth').user!.id,
      }),
      repos.retailPrices.list({ unitId: input.unitId, itemId: input.itemId }),
    ]);
    const before = current[0] ?? null;
    await recordAudit(repos, {
      userId: c.get('auth').user!.id,
      action: 'RETAIL_PRICE_UPDATE',
      entityType: 'retail_price',
      entityId: record.id,
      before: before ? { price: before.price, currency: before.currency } : null,
      after: { price: record.price, currency: record.currency },
    });
    return ok(c, retailPriceDto(record));
  });

  // 历史：同样做 scope 过滤（防止越权读他人仓库的改价记录）。
  router.get('/:unitId/:itemId/history', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const unitId = c.req.param('unitId');
    const itemId = c.req.param('itemId');
    const user = c.get('auth').user!;
    if (user.role === 'RETAILER') {
      // RETAILER 仅可见已签约仓库的改价历史（design.md §3.2.1）。
      const partnerIds = await resolvePartnerWarehouseScope(c, repos, unitId);
      if (partnerIds.denied) return notFound(c, '仓库不存在或未与您的门店签约');
    } else if (!readScopeAllows(user.role ?? null, user.scopeUnitId ?? null, unitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    const rows = await repos.retailPrices.listHistory(unitId, itemId);
    return ok(c, { items: rows.map(retailPriceHistoryDto) });
  });

  return router;
}

// 写路径（改价）：ADMIN 全量；WAREHOUSE 仅本仓（空 scope 拒绝）。
function writeScopeAllows(role: UserRole | null, scope: string | null, unitId: string): boolean {
  if (role === 'ADMIN') return true;
  return !!scope && scope === unitId;
}

// 读路径（列表/历史）：ADMIN/RETAILER 全量（仓库维度）；WAREHOUSE 仅本仓（空 scope 拒绝）。
function readScopeAllows(role: UserRole | null, scope: string | null, unitId: string): boolean {
  if (role === 'ADMIN' || role === 'RETAILER') return true;
  return !!scope && scope === unitId;
}

async function readJson(c: Context<AppEnv>): Promise<unknown | undefined> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}
