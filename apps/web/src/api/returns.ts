import type { Paged, ReturnOrderDetailDto, ReturnOrderDto, ReturnStatus } from '@otunlink/shared';

import { apiGet, apiPost } from './http';

// 退货单 API 客户端（ck-07）：发货退货（拒收）的列表 / 详情 / 处理。

export interface ReturnListQuery {
  status?: ReturnStatus;
  page?: number;
  size?: number;
}

function toQuery(params: ReturnListQuery): string {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
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
