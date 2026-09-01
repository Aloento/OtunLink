import { partnershipCreateSchema } from '@otunlink/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';

import { requireRole, requireUnitScopeAssigned } from '../auth/middleware';
import { partnershipDto, unitDto } from '../lib/dto';
import { dbUnavailable, forbidden, notFound, ok, validationError } from '../lib/http';
import type { AppEnv, UserRecord } from '../types';

// 仓库-零售签约（design.md §3.2.1/§4.2）：签约只由仓库侧发起（把零售加入「可售客户」），
// 零售无需同意、无状态字段。数据范围：
//   GET    WAREHOUSE → 自己归属仓库的客户列表；RETAILER → 已签约仓库列表；ADMIN → 全量
//   POST   仅 WAREHOUSE（自身归属仓库）或 ADMIN
//   DELETE 仅 WAREHOUSE（自己仓库的签约）或 ADMIN
export function partnershipsRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  // 非 ADMIN 必须绑定业务单元（ADMIN 空 scope = 全量）。
  router.use('*', requireUnitScopeAssigned());

  // 可添加的候选零售单元目录（供仓库侧「可售客户」选择器使用，仅 WAREHOUSE/ADMIN）。
  router.get('/candidates', requireRole('WAREHOUSE', 'ADMIN'), async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);
    const retailers = await repos.units.list({ type: 'RETAILER' });
    return ok(c, { items: retailers.map(unitDto) });
  });

  router.get('/', requireRole('WAREHOUSE', 'RETAILER', 'ADMIN'), async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const user = c.get('auth').user!;
    const scope = user.scopeUnitId;
    if (user.role === 'ADMIN') {
      const rows = await repos.partnerships.list();
      return ok(c, { items: rows.map(partnershipDto) });
    }
    if (user.role === 'WAREHOUSE') {
      const rows = await repos.partnerships.list({ warehouseUnitId: scope! });
      return ok(c, { items: rows.map(partnershipDto) });
    }
    // RETAILER：已签约仓库列表
    const rows = await repos.partnerships.list({ retailerUnitId: scope! });
    return ok(c, { items: rows.map(partnershipDto) });
  });

  router.post('/', requireRole('WAREHOUSE', 'ADMIN'), async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');
    const parsed = partnershipCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());
    const input = parsed.data;
    const user = c.get('auth').user!;

    // WAREHOUSE 默认仓库=自身归属单元；ADMIN 可显式传 warehouseUnitId（空 scope 时必须传）。
    const warehouseUnitId = input.warehouseUnitId ?? user.scopeUnitId ?? undefined;
    if (!warehouseUnitId) return validationError(c, '仓库单元缺失：请传 warehouseUnitId');
    if (user.role !== 'ADMIN' && user.scopeUnitId !== warehouseUnitId) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    const [warehouse, retailer] = await Promise.all([
      repos.units.findById(warehouseUnitId),
      repos.units.findById(input.retailerUnitId),
    ]);
    if (!warehouse || warehouse.type !== 'WAREHOUSE') {
      return validationError(c, '仓库单元不存在或不是仓库类型', { warehouseUnitId });
    }
    if (!retailer || retailer.type !== 'RETAILER') {
      return validationError(c, '零售单元不存在或不是零售类型', {
        retailerUnitId: input.retailerUnitId,
      });
    }

    const existing = await repos.partnerships.findByPair(warehouseUnitId, input.retailerUnitId);
    if (existing) return ok(c, partnershipDto(existing), 200);

    const record = await repos.partnerships.create({
      warehouseUnitId,
      retailerUnitId: input.retailerUnitId,
      createdBy: user.id,
    });
    return ok(c, partnershipDto(record), 201);
  });

  router.delete('/:id', requireRole('WAREHOUSE', 'ADMIN'), async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const id = c.req.param('id');
    const record = await repos.partnerships.findById(id);
    if (!record) return notFound(c, '签约不存在');

    const user = c.get('auth').user!;
    if (!ownsPartnership(user, record.warehouseUnitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    const deleted = await repos.partnerships.delete(id);
    if (!deleted) return notFound(c, '签约不存在');
    return ok(c, { id });
  });

  return router;
}

function ownsPartnership(user: UserRecord, warehouseUnitId: string): boolean {
  if (user.role === 'ADMIN') return true;
  return user.role === 'WAREHOUSE' && !!user.scopeUnitId && user.scopeUnitId === warehouseUnitId;
}

async function readJson(c: Context<AppEnv>): Promise<unknown | undefined> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}
