import type {
  DiscrepancyReviewDto,
  Paged,
  ShipmentDetailDto,
  ShipmentDto,
  ShipmentItemCreateInput,
  ShipmentStatus,
  ShipmentTrackingInput,
} from '@otunlink/shared';

import { apiGet, apiPatch, apiPost } from './http';

// 发货单 API 客户端（ck-05 / ck-06）：/shipments、/reviews。

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

// ── 收货点货与差异协商（ck-06）────────────────────────────────────────────────

export interface ShipmentCountLineInput {
  shipmentItemId: string;
  actualQty: string | number;
}

export interface ShipmentCountInput {
  version: number;
  items: ShipmentCountLineInput[];
}

export interface SaveCountResult {
  countVersion: number;
  shipment: ShipmentDetailDto;
}

export interface ReviewItemInput {
  shipmentItemId: string;
  reason?: string | null;
}

export interface SubmitReviewInput {
  items: ReviewItemInput[];
  reason?: string | null;
  photoFileIds?: string[];
}

/** 开始点货：SENT → COUNTING（仅收货方仓库）。 */
export function startCounting(id: string): Promise<ShipmentDetailDto> {
  return apiPost<ShipmentDetailDto>(`/api/v1/shipments/${id}/start-counting`);
}

/** 保存点货草稿（带版本号，服务端持久化，刷新不丢）。 */
export function saveCount(id: string, input: ShipmentCountInput): Promise<SaveCountResult> {
  return apiPost<SaveCountResult>(`/api/v1/shipments/${id}/count`, input);
}

/** 提交差异修订（仓库 → 集货方审批）。 */
export function submitReview(id: string, input: SubmitReviewInput): Promise<DiscrepancyReviewDto> {
  return apiPost<DiscrepancyReviewDto>(`/api/v1/shipments/${id}/reviews`, input);
}

/** 集货方同意差异修订：应收 := 实收。 */
export function approveReview(id: string): Promise<DiscrepancyReviewDto> {
  return apiPost<DiscrepancyReviewDto>(`/api/v1/reviews/${id}/approve`);
}

/** 集货方拒绝差异修订（附理由，仓库可修改重提）。 */
export function rejectReview(id: string, reason: string): Promise<DiscrepancyReviewDto> {
  return apiPost<DiscrepancyReviewDto>(`/api/v1/reviews/${id}/reject`, { reason });
}
