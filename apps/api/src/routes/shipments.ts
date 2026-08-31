import {
  ErrorCodes,
  Permissions,
  shipmentCreateSchema,
  shipmentPatchSchema,
  type ShipmentItemCreateInput,
  type ShipmentStatus,
} from '@otunlink/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';

import { requirePermission, unitScopeFilter } from '../auth/middleware';
import { shipmentDto, shipmentItemDto } from '../lib/dto';
import { dbUnavailable, error, forbidden, notFound, ok, validationError } from '../lib/http';
import type {
  AppEnv,
  CreateShipmentInput,
  CreateShipmentItemInput,
  Repos,
  ShipmentRecord,
  UpdateShipmentInput,
} from '../types';

// 发货单（design.md §4.2 / §5.1 / §8.4 / 附录 B）。
// - 创建：绑定集货方(COLLECTOR) → 收货方(WAREHOUSE)；多物流单号；清单复用物品并
//   写入名称/规格快照；is_perishable 物品逐行必填生产日期+到期日（多批拆行）。
// - 转交：DRAFT → SENT（转交后行/价格锁定，后续点货由 ck-06 处理）。
// - 权限：读 = SHIPMENTS_READ；写 = SHIPMENTS_CREATE；转交 = SHIPMENTS_TRANSFER；
//   scope_unit_id 非空时数据范围收敛到本单元（发货方或收货方命中即放行读）。
export function shipmentsRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  const read = requirePermission(Permissions.SHIPMENTS_READ);
  const write = requirePermission(Permissions.SHIPMENTS_CREATE);
  const transfer = requirePermission(Permissions.SHIPMENTS_TRANSFER);

  router.get('/', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const statusRaw = c.req.query('status')?.trim() ?? '';
    const status = (SHIPMENT_STATUS_FILTER.has(statusRaw) ? statusRaw : undefined) as
      | ShipmentStatus
      | undefined;
    const page = parsePositiveInt(c.req.query('page'), 1);
    const size = parsePositiveInt(c.req.query('size'), 20, 50);
    const scope = unitScopeFilter(c.get('auth'));

    const result = await repos.shipments.list({ page, size, status, scopeUnitId: scope?.unitId });
    const items = await hydrateList(repos, result.items);
    return ok(c, { ...result, items });
  });

  router.post('/', write, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');

    const parsed = shipmentCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    const user = c.get('auth').user!;
    if (!scopeAllowsWrite(user.scopeUnitId, parsed.data.shipperUnitId)) {
      return forbidden(c, '数据范围越界（只能操作自己单元的发货单）');
    }

    const unitCheck = await validateUnits(repos, parsed.data.shipperUnitId, parsed.data.receiverUnitId);
    if (!unitCheck.ok) return validationError(c, unitCheck.message);

    const lines = await buildLines(repos, parsed.data.items);
    if (!lines.ok) return validationError(c, lines.message);

    const input: CreateShipmentInput = {
      shipperUnitId: parsed.data.shipperUnitId,
      receiverUnitId: parsed.data.receiverUnitId,
      boxesCount: parsed.data.boxesCount,
      currency: parsed.data.currency ?? 'CNY',
      expectedArrivalDate: parsed.data.expectedArrivalDate ?? null,
      remark: parsed.data.remark ?? null,
      trackings: parsed.data.trackings.map((t) => ({
        carrier: t.carrier,
        trackingNo: t.trackingNo,
        note: t.note ?? null,
      })),
      items: lines.items,
      createdBy: user.id,
    };

    try {
      const created = await repos.shipments.create(input);
      return ok(c, await detailOf(repos, created), 201);
    } catch (cause) {
      if (isTrackingConflict(cause)) {
        return error(c, 409, ErrorCodes.TRACKING_CONFLICT, '物流单号已存在');
      }
      throw cause;
    }
  });

  router.get('/:id', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const shipment = await repos.shipments.findById(c.req.param('id'));
    if (!shipment) return notFound(c, '发货单不存在');

    if (!scopeAllowsRead(c.get('auth').user?.scopeUnitId ?? null, shipment)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    return ok(c, await detailOf(repos, shipment));
  });

  router.patch('/:id', write, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const existing = await repos.shipments.findById(c.req.param('id'));
    if (!existing) return notFound(c, '发货单不存在');

    const user = c.get('auth').user!;
    if (!scopeAllowsWrite(user.scopeUnitId, existing.shipperUnitId)) {
      return forbidden(c, '数据范围越界（只能编辑自己单元的发货单）');
    }

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');

    const parsed = shipmentPatchSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    const nextShipper = parsed.data.shipperUnitId ?? existing.shipperUnitId;
    const nextReceiver = parsed.data.receiverUnitId ?? existing.receiverUnitId;
    if (parsed.data.shipperUnitId !== undefined && !scopeAllowsWrite(user.scopeUnitId, nextShipper)) {
      return forbidden(c, '数据范围越界（只能操作自己单元的发货单）');
    }
    if (parsed.data.shipperUnitId !== undefined || parsed.data.receiverUnitId !== undefined) {
      const unitCheck = await validateUnits(repos, nextShipper, nextReceiver);
      if (!unitCheck.ok) return validationError(c, unitCheck.message);
    }

    const patch: UpdateShipmentInput = {
      ...(parsed.data.shipperUnitId !== undefined ? { shipperUnitId: parsed.data.shipperUnitId } : {}),
      ...(parsed.data.receiverUnitId !== undefined ? { receiverUnitId: parsed.data.receiverUnitId } : {}),
      ...(parsed.data.boxesCount !== undefined ? { boxesCount: parsed.data.boxesCount } : {}),
      ...(parsed.data.currency !== undefined ? { currency: parsed.data.currency } : {}),
      ...(parsed.data.expectedArrivalDate !== undefined
        ? { expectedArrivalDate: parsed.data.expectedArrivalDate ?? null }
        : {}),
      ...(parsed.data.remark !== undefined ? { remark: parsed.data.remark ?? null } : {}),
      ...(parsed.data.trackings !== undefined
        ? {
            trackings: parsed.data.trackings.map((t) => ({
              carrier: t.carrier,
              trackingNo: t.trackingNo,
              note: t.note ?? null,
            })),
          }
        : {}),
    };

    if (parsed.data.items !== undefined) {
      const lines = await buildLines(repos, parsed.data.items);
      if (!lines.ok) return validationError(c, lines.message);
      patch.items = lines.items;
    }

    try {
      const updated = await repos.shipments.update(existing.id, patch);
      if (!updated) return notFound(c, '发货单不存在');
      return ok(c, await detailOf(repos, updated));
    } catch (cause) {
      if (isTrackingConflict(cause)) {
        return error(c, 409, ErrorCodes.TRACKING_CONFLICT, '物流单号已存在');
      }
      if (isStateConflict(cause)) {
        return error(c, 409, ErrorCodes.SHIPMENT_STATE_CONFLICT, '仅草稿状态可编辑');
      }
      throw cause;
    }
  });

  router.post('/:id/send', transfer, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const existing = await repos.shipments.findById(c.req.param('id'));
    if (!existing) return notFound(c, '发货单不存在');

    const user = c.get('auth').user!;
    if (!scopeAllowsWrite(user.scopeUnitId, existing.shipperUnitId)) {
      return forbidden(c, '数据范围越界（只能转交自己单元的发货单）');
    }

    try {
      const sent = await repos.shipments.send(existing.id);
      if (!sent) return notFound(c, '发货单不存在');
      return ok(c, await detailOf(repos, sent));
    } catch (cause) {
      if (isStateConflict(cause)) {
        return error(c, 409, ErrorCodes.SHIPMENT_STATE_CONFLICT, '仅草稿状态可转交');
      }
      throw cause;
    }
  });

  return router;
}

// 状态查询参数白名单：避免非法枚举值直传过滤层。
const SHIPMENT_STATUS_FILTER = new Set([
  'DRAFT',
  'SENT',
  'COUNTING',
  'READY',
  'DISCREPANCY',
  'REVIEW_PENDING',
  'INBOUNDED',
  'RETURN_PENDING',
  'RETURNED',
]);

function parsePositiveInt(raw: string | undefined, fallback: number, max?: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  if (max !== undefined && n > max) return max;
  return n;
}

async function readJson(c: Context<AppEnv>): Promise<unknown | undefined> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

// 写路径数据范围：scope 非空时发货方必须等于本单元。
function scopeAllowsWrite(scopeUnitId: string | null, shipperUnitId: string): boolean {
  return !scopeUnitId || shipperUnitId === scopeUnitId;
}

// 读路径数据范围：scope 非空时，发货方或收货方命中即放行。
function scopeAllowsRead(scopeUnitId: string | null, shipment: ShipmentRecord): boolean {
  if (!scopeUnitId) return true;
  return shipment.shipperUnitId === scopeUnitId || shipment.receiverUnitId === scopeUnitId;
}

// 发货方/收货方类型校验：集货方 → 仓库。
async function validateUnits(
  repos: Repos,
  shipperUnitId: string,
  receiverUnitId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [shipper, receiver] = await Promise.all([
    repos.units.findById(shipperUnitId),
    repos.units.findById(receiverUnitId),
  ]);
  if (!shipper) return { ok: false, message: '发货方业务单元不存在' };
  if (!receiver) return { ok: false, message: '收货方业务单元不存在' };
  if (shipper.type !== 'COLLECTOR') return { ok: false, message: '发货方必须是集货方（COLLECTOR）' };
  if (receiver.type !== 'WAREHOUSE') return { ok: false, message: '收货方必须是仓库（WAREHOUSE）' };
  return { ok: true };
}

type LinesResult =
  | { ok: true; items: CreateShipmentItemInput[] }
  | { ok: false; message: string };

// 清单行：复用物品目录 → 快照名称/规格；is_perishable 必填生产日期+到期日。
async function buildLines(repos: Repos, lines: ShipmentItemCreateInput[]): Promise<LinesResult> {
  const items: CreateShipmentItemInput[] = [];
  for (const line of lines) {
    const item = await repos.items.findById(line.itemId);
    if (!item) return { ok: false, message: `物品不存在: ${line.itemId}` };
    const productionDate = line.productionDate ?? null;
    const expiryDate = line.expiryDate ?? null;
    if (item.isPerishable && (!productionDate || !expiryDate)) {
      return { ok: false, message: `易腐物品「${item.name}」必须填写生产日期与到期日` };
    }
    items.push({
      itemId: item.id,
      name: item.name,
      spec: item.specUnit,
      expectedQty: line.expectedQty,
      unitPrice: line.unitPrice ?? null,
      productionDate,
      expiryDate,
      lineNote: line.lineNote ?? null,
    });
  }
  return { ok: true, items };
}

// 列表：批量带出物流单号 + 发货/收货方名称。
async function hydrateList(repos: Repos, rows: ShipmentRecord[]) {
  if (rows.length === 0) return [];
  const unitIds = [...new Set(rows.flatMap((r) => [r.shipperUnitId, r.receiverUnitId]))];
  const units = await Promise.all(unitIds.map((id) => repos.units.findById(id)));
  const nameOf = new Map(units.map((u) => [u?.id, u?.name ?? null]));
  const trackings = await repos.shipments.listTrackingsForShipments(rows.map((r) => r.id));
  return rows.map((row) =>
    shipmentDto(row, {
      shipperName: nameOf.get(row.shipperUnitId) ?? null,
      receiverName: nameOf.get(row.receiverUnitId) ?? null,
      trackings: trackings.get(row.id) ?? [],
    }),
  );
}

// 详情：物流单号 + 清单 + 名称。
async function detailOf(repos: Repos, shipment: ShipmentRecord) {
  const [shipper, receiver, trackings, items] = await Promise.all([
    repos.units.findById(shipment.shipperUnitId),
    repos.units.findById(shipment.receiverUnitId),
    repos.shipments.listTrackings(shipment.id),
    repos.shipments.listItems(shipment.id),
  ]);
  return {
    ...shipmentDto(shipment, {
      shipperName: shipper?.name ?? null,
      receiverName: receiver?.name ?? null,
      trackings,
    }),
    items: items.map(shipmentItemDto),
  };
}

function isTrackingConflict(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('TRACKING_CONFLICT');
}

function isStateConflict(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('SHIPMENT_STATE_CONFLICT');
}
