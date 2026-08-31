import { ErrorCodes, Permissions, reviewRejectSchema } from '@otunlink/shared';
import { Hono } from 'hono';

import { requirePermission } from '../auth/middleware';
import { createMailer } from '../lib/email';
import { discrepancyReviewDto } from '../lib/dto';
import { dbUnavailable, error, forbidden, notFound, ok, validationError } from '../lib/http';
import { notify } from '../lib/notify';
import type { AppEnv } from '../types';

// 差异修订审批（design.md §3.2 / §5.1 / 附录 A）。
// - 审批（approve）：仓库提交的 PENDING → 集货方同意 → 应收 := 实收（审计）→ 发货单 READY。
// - 拒绝（reject）：PENDING → 附理由 → 发货单 DISCREPANCY（仓库可修改后重提）。
// - 权限：REVIEWS_APPROVE（COLLECTOR/ADMIN）；scope_unit_id 非空时发货方必须等于本单元。
export function reviewsRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  const approve = requirePermission(Permissions.REVIEWS_APPROVE);

  router.post('/:id/approve', approve, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const review = await repos.shipments.findReview(c.req.param('id'));
    if (!review) return notFound(c, '差异修订不存在');

    const shipment = await repos.shipments.findById(review.shipmentId);
    if (!shipment) return notFound(c, '发货单不存在');

    const user = c.get('auth').user!;
    if (user.scopeUnitId && shipment.shipperUnitId !== user.scopeUnitId) {
      return forbidden(c, '数据范围越界（仅发货方集货可审批）');
    }

    try {
      const updated = await repos.shipments.approveReview(review.id, user.id);
      if (!updated) return notFound(c, '差异修订不存在');
      await notify(repos, createMailer(c.env), {
        type: 'REVIEW_APPROVED',
        title: `发货单 ${shipment.shipmentNo} 差异修订已审批通过`,
        content: '差异修订已通过，发货单进入 READY 可确认入库。',
        link: `/shipments/${shipment.id}`,
        unitId: shipment.receiverUnitId,
      });
      return ok(c, discrepancyReviewDto(updated));
    } catch (cause) {
      if (isReviewAlreadyProcessed(cause)) {
        return error(c, 409, ErrorCodes.REVIEW_ALREADY_PROCESSED, '该修订已被处理，请刷新');
      }
      throw cause;
    }
  });

  router.post('/:id/reject', approve, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const review = await repos.shipments.findReview(c.req.param('id'));
    if (!review) return notFound(c, '差异修订不存在');

    const shipment = await repos.shipments.findById(review.shipmentId);
    if (!shipment) return notFound(c, '发货单不存在');

    const user = c.get('auth').user!;
    if (user.scopeUnitId && shipment.shipperUnitId !== user.scopeUnitId) {
      return forbidden(c, '数据范围越界（仅发货方集货可审批）');
    }

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');
    const parsed = reviewRejectSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    try {
      const updated = await repos.shipments.rejectReview(review.id, user.id, parsed.data.reason);
      if (!updated) return notFound(c, '差异修订不存在');
      await notify(repos, createMailer(c.env), {
        type: 'REVIEW_REJECTED',
        title: `发货单 ${shipment.shipmentNo} 差异修订被驳回`,
        content: `差异修订被驳回，请根据理由调整后重新提交。理由：${parsed.data.reason ?? '无'}`,
        link: `/shipments/${shipment.id}`,
        unitId: shipment.receiverUnitId,
      });
      return ok(c, discrepancyReviewDto(updated));
    } catch (cause) {
      if (isReviewAlreadyProcessed(cause)) {
        return error(c, 409, ErrorCodes.REVIEW_ALREADY_PROCESSED, '该修订已被处理，请刷新');
      }
      throw cause;
    }
  });

  return router;
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown | undefined> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function isReviewAlreadyProcessed(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('REVIEW_ALREADY_PROCESSED');
}
