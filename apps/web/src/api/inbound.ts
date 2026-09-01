import type {
  InboundOrderDetailDto,
  InboundOrderDto,
  InboundStatus,
  InboundManualCreateInput,
  Paged,
} from '@otunlink/shared';

import { apiGet, apiPost } from './http';

// 入库单 API 客户端：确认收货自动建档的 DRAFT/POSTED + 手工入库单（sourceType=MANUAL）。

export interface InboundListQuery {
  status?: InboundStatus;
  page?: number;
  size?: number;
}

function toQuery(params: InboundListQuery): string {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.size !== undefined) search.set('size', String(params.size));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function listInbounds(params: InboundListQuery = {}): Promise<Paged<InboundOrderDto>> {
  return apiGet<Paged<InboundOrderDto>>(`/api/v1/inbound-orders${toQuery(params)}`);
}

export function getInbound(id: string): Promise<InboundOrderDetailDto> {
  return apiGet<InboundOrderDetailDto>(`/api/v1/inbound-orders/${id}`);
}

/** 过账：DRAFT → POSTED，建档批次并写库存/台账。 */
export function postInbound(id: string): Promise<InboundOrderDetailDto> {
  return apiPost<InboundOrderDetailDto>(`/api/v1/inbound-orders/${id}/post`);
}

/** 新建手工入库单（sourceType=MANUAL）。 */
export function createManualInbound(input: InboundManualCreateInput): Promise<InboundOrderDetailDto> {
  return apiPost<InboundOrderDetailDto>('/api/v1/inbound-orders', input);
}
