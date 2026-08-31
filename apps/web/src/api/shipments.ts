import type {
  Paged,
  ShipmentDetailDto,
  ShipmentDto,
  ShipmentItemCreateInput,
  ShipmentStatus,
  ShipmentTrackingInput,
} from '@otunlink/shared';

import { apiGet, apiPatch, apiPost } from './http';

// 发货单 API 客户端（ck-05）：/shipments。

export interface ShipmentListQuery {
  status?: ShipmentStatus;
  page?: number;
  size?: number;
}

export interface ShipmentCreateInput {
  shipperUnitId: string;
  receiverUnitId: string;
  boxesCount: number;
  currency?: string;
  expectedArrivalDate?: string | null;
  remark?: string | null;
  trackings: ShipmentTrackingInput[];
  items: ShipmentItemCreateInput[];
}

export type ShipmentUpdateInput = Partial<ShipmentCreateInput>;

function toQuery(params: ShipmentListQuery): string {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.size !== undefined) search.set('size', String(params.size));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function listShipments(params: ShipmentListQuery = {}): Promise<Paged<ShipmentDto>> {
  return apiGet<Paged<ShipmentDto>>(`/api/v1/shipments${toQuery(params)}`);
}

export function getShipment(id: string): Promise<ShipmentDetailDto> {
  return apiGet<ShipmentDetailDto>(`/api/v1/shipments/${id}`);
}

export function createShipment(input: ShipmentCreateInput): Promise<ShipmentDetailDto> {
  return apiPost<ShipmentDetailDto>('/api/v1/shipments', input);
}

export function updateShipment(id: string, input: ShipmentUpdateInput): Promise<ShipmentDetailDto> {
  return apiPatch<ShipmentDetailDto>(`/api/v1/shipments/${id}`, input);
}

export function sendShipment(id: string): Promise<ShipmentDetailDto> {
  return apiPost<ShipmentDetailDto>(`/api/v1/shipments/${id}/send`);
}
