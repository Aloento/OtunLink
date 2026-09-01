import {
  ErrorCodes,
  Permissions,
  confirmReceiptSchema,
  returnCreateSchema,
  shipmentCountSchema,
  shipmentCreateSchema,
  shipmentPatchSchema,
  shipmentReviewCreateSchema,
  type ShipmentItemCreateInput,
  type ShipmentStatus,
} from '@otunlink/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';

import { requirePermission, requireUnitScopeAssigned, unitScopeFilter } from '../auth/middleware';
import { createMailer } from '../lib/email';
import {
  discrepancyReviewDto,
  inboundDto,
  inboundItemDto,
  returnDto,
  returnItemDto,
  shipmentDto,
  shipmentItemDto,
} from '../lib/dto';
import { dbUnavailable, error, forbidden, notFound, ok, validationError } from '../lib/http';
import { notify } from '../lib/notify';
import type {
  AppEnv,
  ConfirmReceiptRepoInput,
  CreateReturnRepoInput,
  CreateReviewLineInput,
  CreateShipmentInput,
  CreateShipmentItemInput,
  InboundOrderRecord,
  Repos,
  ReturnOrderRecord,
  ShipmentCountRepoInput,
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

  // 非 ADMIN 必须绑定业务单元才能访问业务数据（ADMIN 空 scope = 全量）。
  router.use('*', requireUnitScopeAssigned());

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
      await notify(repos, createMailer(c.env), {
        type: 'SHIPMENT_SENT',
        title: `发货单 ${sent.shipmentNo} 已发出，请点货`,
        content: '集货方已转交发货单，请仓库核对货物并完成点货。',
        link: `/shipments/${sent.id}`,
        unitId: sent.receiverUnitId,
      });
      return ok(c, await detailOf(repos, sent));
    } catch (cause) {
      if (isStateConflict(cause)) {
        return error(c, 409, ErrorCodes.SHIPMENT_STATE_CONFLICT, '仅草稿状态可转交');
      }
      throw cause;
    }
  });

  // ── 收货点货与差异协商（ck-06）───────────────────────────────────────────────
  // 点货/提交差异：仅收货方仓库（COUNTING_WRITE / REVIEWS_SUBMIT），
  // scope_unit_id 非空时必须等于 receiver_unit_id。

  const counting = requirePermission(Permissions.COUNTING_WRITE);
  const reviewSubmit = requirePermission(Permissions.REVIEWS_SUBMIT);

  router.post('/:id/start-counting', counting, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const existing = await repos.shipments.findById(c.req.param('id'));
    if (!existing) return notFound(c, '发货单不存在');

    const user = c.get('auth').user!;
    if (!scopeAllowsReceiver(user.scopeUnitId, existing)) {
      return forbidden(c, '数据范围越界（只能对本仓库收货的发货单点货）');
    }

    try {
      const started = await repos.shipments.startCounting(existing.id);
      if (!started) return notFound(c, '发货单不存在');
      return ok(c, await detailOf(repos, started));
    } catch (cause) {
      if (isCountingStateConflict(cause)) {
        return error(c, 409, ErrorCodes.COUNTING_STATE_CONFLICT, '仅已送达（SENT）状态可开始点货');
      }
      throw cause;
    }
  });

  router.post('/:id/count', counting, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const existing = await repos.shipments.findById(c.req.param('id'));
    if (!existing) return notFound(c, '发货单不存在');

    const user = c.get('auth').user!;
    if (!scopeAllowsReceiver(user.scopeUnitId, existing)) {
      return forbidden(c, '数据范围越界（只能对本仓库收货的发货单点货）');
    }

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');

    const parsed = shipmentCountSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    const input: ShipmentCountRepoInput = {
      version: parsed.data.version,
      lines: parsed.data.items.map((l) => ({
        shipmentItemId: l.shipmentItemId,
        actualQty: l.actualQty,
      })),
    };

    try {
      const result = await repos.shipments.saveCount(existing.id, input);
      if (!result) return notFound(c, '发货单不存在');
      return ok(c, {
        countVersion: result.countVersion,
        shipment: await detailOf(repos, result.shipment),
      });
    } catch (cause) {
      if (isCountingStateConflict(cause)) {
        return error(c, 409, ErrorCodes.COUNTING_STATE_CONFLICT, '点货状态冲突（请刷新后重试）');
      }
      if (isCountLineInvalid(cause)) {
        return error(c, 400, ErrorCodes.VALIDATION_ERROR, '清单行不属于该发货单');
      }
      throw cause;
    }
  });

  // ── 确认收货 → 入库建档（ck-07）───────────────────────────────────────────────
  // 仅收货方仓库；READY → 自动建 DRAFT 入库单 + 发货单 INBOUNDED。

  const inboundConfirm = requirePermission(Permissions.INBOUND_CONFIRM);

  router.post('/:id/confirm-receipt', inboundConfirm, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const existing = await repos.shipments.findById(c.req.param('id'));
    if (!existing) return notFound(c, '发货单不存在');

    const user = c.get('auth').user!;
    if (!scopeAllowsReceiver(user.scopeUnitId, existing)) {
      return forbidden(c, '数据范围越界（只能由本仓库确认收货）');
    }

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');

    const parsed = confirmReceiptSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    const input: ConfirmReceiptRepoInput = {
      remark: parsed.data.remark ?? null,
      photoFileIds: parsed.data.photoFileIds ?? [],
      createdBy: user.id,
      lines: (parsed.data.items ?? []).map((l) => ({
        shipmentItemId: l.shipmentItemId,
        batchNo: l.batchNo ?? null,
      })),
    };

    try {
      const inbound = await repos.inbounds.confirmReceipt(existing.id, input);
      await notify(repos, createMailer(c.env), {
        type: 'INBOUND_CONFIRMED',
        title: `发货单 ${existing.shipmentNo} 已确认收货，已建入库单`,
        content: '仓库完成点货并确认收货，入库单已生成待过账。',
        link: `/shipments/${existing.id}`,
        unitId: existing.shipperUnitId,
      });
      return ok(c, await inboundDetailOf(repos, inbound), 201);
    } catch (cause) {
      if (isShipmentNotReady(cause)) {
        return error(c, 409, ErrorCodes.SHIPMENT_NOT_READY, '发货单未就绪（需 READY 且点货无差异）');
      }
      throw cause;
    }
  });

  // ── 发货退货（拒收）发起（ck-07）──────────────────────────────────────────────
  // 仅收货方仓库；READY → 创建 PENDING 退货单 + 发货单 RETURN_PENDING。

  const returnCreate = requirePermission(Permissions.SHIPMENT_RETURNS_CREATE);

  router.post('/:id/returns', returnCreate, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const existing = await repos.shipments.findById(c.req.param('id'));
    if (!existing) return notFound(c, '发货单不存在');

    const user = c.get('auth').user!;
    if (!scopeAllowsReceiver(user.scopeUnitId, existing)) {
      return forbidden(c, '数据范围越界（只能由本仓库发起退货）');
    }

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');

    const parsed = returnCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    const input: CreateReturnRepoInput = {
      shipmentId: existing.id,
      reason: parsed.data.reason ?? null,
      note: parsed.data.note ?? null,
      photoFileIds: parsed.data.photoFileIds ?? [],
      returnCarrier: parsed.data.returnCarrier ?? null,
      returnTrackingNo: parsed.data.returnTrackingNo ?? null,
      createdBy: user.id,
      lines: parsed.data.items.map((l) => ({
        shipmentItemId: l.shipmentItemId,
        qty: l.qty,
        reason: l.reason ?? null,
      })),
    };

    try {
      const order = await repos.returns.createReturn(input);
      await notify(repos, createMailer(c.env), {
        type: 'SHIPMENT_RETURN_PENDING',
        title: `发货单 ${existing.shipmentNo} 发起退货，请处理`,
        content: '收货方仓库发起退货，需集货方确认处理。',
        link: `/shipments/${existing.id}`,
        unitId: existing.shipperUnitId,
      });
      return ok(c, await returnDetailOf(repos, order), 201);
    } catch (cause) {
      if (isReturnStateConflict(cause)) {
        return error(c, 409, ErrorCodes.RETURN_STATE_CONFLICT, '仅 READY 状态的发货单可发起退货');
      }
      if (isReturnLineInvalid(cause)) {
        return error(c, 400, ErrorCodes.RETURN_LINE_INVALID, '退货行不合法（数量或清单行不存在）');
      }
      throw cause;
    }
  });

  router.post('/:id/reviews', reviewSubmit, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const existing = await repos.shipments.findById(c.req.param('id'));
    if (!existing) return notFound(c, '发货单不存在');

    const user = c.get('auth').user!;
    if (!scopeAllowsReceiver(user.scopeUnitId, existing)) {
      return forbidden(c, '数据范围越界（只能由本仓库提交差异修订）');
    }

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');

    const parsed = shipmentReviewCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    const shipmentItems = await repos.shipments.listItems(existing.id);
    const byId = new Map(shipmentItems.map((i) => [i.id, i]));
    const lines: CreateReviewLineInput[] = [];
    for (const line of parsed.data.items) {
      const item = byId.get(line.shipmentItemId);
      if (!item) return validationError(c, `清单行不存在: ${line.shipmentItemId}`);
      if (item.actualQty === null || item.actualQty === '') {
        return validationError(c, '请先完成点货再提交差异修订');
      }
      lines.push({
        shipmentItemId: item.id,
        actualQty: item.actualQty,
        expectedQtyBefore: item.expectedQty,
        reason: line.reason ?? null,
      });
    }

    try {
      const review = await repos.shipments.createReview({
        shipmentId: existing.id,
        reason: parsed.data.reason ?? null,
        photoFileIds: parsed.data.photoFileIds ?? [],
        submittedBy: user.id,
        lines,
      });
      await notify(repos, createMailer(c.env), {
        type: 'REVIEW_PENDING',
        title: `发货单 ${existing.shipmentNo} 存在数量差异待审批`,
        content: '收货方提交了差异修订，请集货方审核。',
        link: `/shipments/${existing.id}`,
        unitId: existing.shipperUnitId,
      });
      return ok(c, discrepancyReviewDto(review), 201);
    } catch (cause) {
      if (isReviewAlreadyProcessed(cause)) {
        return error(c, 409, ErrorCodes.REVIEW_ALREADY_PROCESSED, '该发货单已存在待审批或已处理的修订');
      }
      if (isReviewNoDifference(cause)) {
        return error(c, 400, ErrorCodes.REVIEW_NO_DIFFERENCE, '当前没有可提交的数量差异');
      }
      if (isCountLineInvalid(cause)) {
        return error(c, 400, ErrorCodes.VALIDATION_ERROR, '清单行不属于该发货单');
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

// 写路径数据范围：ADMIN 全量（scope 为 null）；非 ADMIN（经 requireUnitScopeAssigned 保证 scope 非空）发货方必须等于本单元。
function scopeAllowsWrite(scopeUnitId: string | null, shipperUnitId: string): boolean {
  return !scopeUnitId || shipperUnitId === scopeUnitId;
}

// 点货/差异提交写路径数据范围：ADMIN 全量（scope 为 null）；非 ADMIN 收货方必须等于本单元。
function scopeAllowsReceiver(scopeUnitId: string | null, shipment: ShipmentRecord): boolean {
  return !scopeUnitId || shipment.receiverUnitId === scopeUnitId;
}

// 读路径数据范围：ADMIN 全量（scope 为 null）；非 ADMIN 发货方或收货方命中即放行。
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

// 入库单详情：仓库/往来方名称 + 发货单号 + 明细（含物品名/规格）。
async function inboundDetailOf(repos: Repos, inbound: InboundOrderRecord) {
  const [warehouse, counterparty, shipment, items] = await Promise.all([
    repos.units.findById(inbound.warehouseUnitId),
    inbound.counterpartyUnitId ? repos.units.findById(inbound.counterpartyUnitId) : Promise.resolve(null),
    inbound.shipmentId ? repos.shipments.findById(inbound.shipmentId) : Promise.resolve(null),
    repos.inbounds.listItems(inbound.id),
  ]);
  return {
    ...inboundDto(inbound, {
      warehouseName: warehouse?.name ?? null,
      counterpartyName: counterparty?.name ?? null,
      shipmentNo: shipment?.shipmentNo ?? null,
    }),
    items: items.map(inboundItemDto),
  };
}

// 退货单详情：发起/接收方名称 + 发货单号 + 明细（含物品名）。
async function returnDetailOf(repos: Repos, order: ReturnOrderRecord) {
  const [from, to, shipment, items] = await Promise.all([
    repos.units.findById(order.fromUnitId),
    repos.units.findById(order.toUnitId),
    order.shipmentId ? repos.shipments.findById(order.shipmentId) : Promise.resolve(null),
    repos.returns.listItems(order.id),
  ]);
  return {
    ...returnDto(order, {
      fromUnitName: from?.name ?? null,
      toUnitName: to?.name ?? null,
      shipmentNo: shipment?.shipmentNo ?? null,
    }),
    items: items.map(returnItemDto),
  };
}

// 详情：物流单号 + 清单 + 差异修订记录 + 名称。
async function detailOf(repos: Repos, shipment: ShipmentRecord) {
  const [shipper, receiver, trackings, items, reviews] = await Promise.all([
    repos.units.findById(shipment.shipperUnitId),
    repos.units.findById(shipment.receiverUnitId),
    repos.shipments.listTrackings(shipment.id),
    repos.shipments.listItems(shipment.id),
    repos.shipments.listReviews(shipment.id),
  ]);
  return {
    ...shipmentDto(shipment, {
      shipperName: shipper?.name ?? null,
      receiverName: receiver?.name ?? null,
      trackings,
    }),
    items: items.map(shipmentItemDto),
    reviews: reviews.map(discrepancyReviewDto),
  };
}

function isTrackingConflict(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('TRACKING_CONFLICT');
}

function isStateConflict(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('SHIPMENT_STATE_CONFLICT');
}

function isCountingStateConflict(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('COUNTING_STATE_CONFLICT');
}

function isCountLineInvalid(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('COUNT_LINE_INVALID');
}

function isReviewAlreadyProcessed(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('REVIEW_ALREADY_PROCESSED');
}

function isReviewNoDifference(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('REVIEW_NO_DIFFERENCE');
}

function isShipmentNotReady(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('SHIPMENT_NOT_READY');
}

function isReturnStateConflict(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('RETURN_STATE_CONFLICT');
}

function isReturnLineInvalid(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('RETURN_LINE_INVALID');
}
