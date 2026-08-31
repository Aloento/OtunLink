import type {
  Paged,
  ReturnOrderDetailDto,
  ReturnOrderDto,
  ReturnSourceType,
  ReturnStatus,
} from '@otunlink/shared';

import { apiGet, apiPost } from './http';

// 退货单 API 客户端：ck-07 发货退货（拒收）+ ck-09b 零售售后退货（SALES）。

export interface ReturnListQuery {
  status?: ReturnStatus;
  /** ck-09b：按来源过滤（SHIPMENT 发货退货 / SALES 零售售后）。 */
  sourceType?: ReturnSourceType;
  /** ck-09b：按销售单过滤（SALES 来源）。 */
  salesOrderId?: string;
  page?: number;
  size?: number;
}

function toQuery(params: ReturnListQuery): string {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.sourceType) search.set('sourceType', params.sourceType);
  if (params.salesOrderId) search.set('salesOrderId', params.salesOrderId);
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.size !== undefined) search.set('size', String(params.size));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function listReturns(params: ReturnListQuery = {}): Promise<Paged<ReturnOrderDto>> {
  return apiGet<Paged<ReturnOrderDto>>(`/api/v1/return-orders${toQuery(params)}`);
}

export function getReturn(id: string): Promise<ReturnOrderDetailDto> {
  return apiGet<ReturnOrderDetailDto>(`/api/v1/return-orders/${id}`);
}

/** 集货方接受退货：全部拒收 → RETURNED；部分拒收 → 剩余自动建档入库单。 */
export function acceptReturn(id: string, note?: string | null): Promise<ReturnOrderDetailDto> {
  return apiPost<ReturnOrderDetailDto>(`/api/v1/return-orders/${id}/accept`, { note: note ?? null });
}

/** 集货方拒绝退货：退货单 REJECTED，发货单回到 READY。 */
export function rejectReturn(id: string, note: string): Promise<ReturnOrderDetailDto> {
  return apiPost<ReturnOrderDetailDto>(`/api/v1/return-orders/${id}/reject`, { note });
}

// ── ck-09b 零售售后退货（SALES）────────────────────────────────────────────────

export interface SalesReturnCreateItemInput {
  salesOrderItemId: string;
  qty: string;
  reason?: string | null;
}

export interface SalesReturnCreateInput {
  items: SalesReturnCreateItemInput[];
  reason?: string | null;
  note?: string | null;
  photoFileIds?: string[];
}

export interface SalesReturnReceiveLineInput {
  returnItemId: string;
  receivedQty: string;
}

export interface SalesReturnReceiveInput {
  items: SalesReturnReceiveLineInput[];
  note?: string | null;
}

/** 零售方发起售后：行级退货数量 ≤ 实收未退数量，状态 REQUESTED。 */
export function createSalesReturn(
  salesOrderId: string,
  input: SalesReturnCreateInput,
): Promise<ReturnOrderDetailDto> {
  return apiPost<ReturnOrderDetailDto>(`/api/v1/sales-orders/${salesOrderId}/returns`, input);
}

/** 仓库审核同意：REQUESTED → APPROVED（待收货）。 */
export function approveSalesReturn(id: string, note?: string | null): Promise<ReturnOrderDetailDto> {
  return apiPost<ReturnOrderDetailDto>(`/api/v1/return-orders/${id}/approve`, {
    note: note ?? null,
  });
}

/** 仓库退回收货：录入实收数量 → 回补库存 → RETURNED。 */
export function receiveSalesReturn(
  id: string,
  input: SalesReturnReceiveInput,
): Promise<ReturnOrderDetailDto> {
  return apiPost<ReturnOrderDetailDto>(`/api/v1/return-orders/${id}/receive`, input);
}
