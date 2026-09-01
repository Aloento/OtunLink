import type {
  OutboundOrderDetailDto,
  OutboundOrderDto,
  OutboundType,
  Paged,
} from '@otunlink/shared';
import type { OutboundCreateInput } from '@otunlink/shared';

import { apiDelete, apiGet, apiPatch, apiPost } from './http';

// 出库单 API 客户端：手工出库（NORMAL），POST 后按 FEFO 或指定批次扣减。

export interface OutboundOrderListQuery {
  status?: OutboundOrderDto['status'];
  type?: OutboundType;
  page?: number;
  size?: number;
}

function toQuery(params: OutboundOrderListQuery): string {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.type) search.set('type', params.type);
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.size !== undefined) search.set('size', String(params.size));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function listOutboundOrders(params: OutboundOrderListQuery = {}): Promise<Paged<OutboundOrderDto>> {
  return apiGet<Paged<OutboundOrderDto>>(`/api/v1/outbound-orders${toQuery(params)}`);
}

export function getOutboundOrder(id: string): Promise<OutboundOrderDetailDto> {
  return apiGet<OutboundOrderDetailDto>(`/api/v1/outbound-orders/${id}`);
}

export function createOutboundOrder(input: OutboundCreateInput): Promise<OutboundOrderDetailDto> {
  return apiPost<OutboundOrderDetailDto>('/api/v1/outbound-orders', input);
}

/** 编辑草稿出库单（PATCH /outbound-orders/:id）：仅 DRAFT 可改，后端返回 409 否则。 */
export function updateOutboundOrder(
  id: string,
  input: OutboundCreateInput,
): Promise<OutboundOrderDetailDto> {
  return apiPatch<OutboundOrderDetailDto>(`/api/v1/outbound-orders/${id}`, input);
}

/** 过账：DRAFT → POSTED，按 FEFO（或指定批次）扣减库存并写流水；低于可用量报 INSUFFICIENT_STOCK。 */
export function postOutboundOrder(id: string): Promise<OutboundOrderDetailDto> {
  return apiPost<OutboundOrderDetailDto>(`/api/v1/outbound-orders/${id}/post`);
}

/** 删除草稿出库单：仅 DRAFT 可删，其他状态后端返回 409。 */
export function deleteOutboundOrder(id: string): Promise<{ id: string }> {
  return apiDelete<{ id: string }>(`/api/v1/outbound-orders/${id}`);
}
