import type {
  PaymentDto,
  SalesOrderCreateInput,
  SalesOrderDetailDto,
  SalesOrderDto,
  SalesOrderPatchInput,
  SalesOrderSendInput,
  SalesPaymentInput,
  SalesStatus,
} from '@otunlink/shared';

import { apiGet, apiPatch, apiPost } from './http';

// 销售单 API 客户端（ck-09a §4.2/§5.5）：门店请货 + 仓库主动送货，
// 发送时 FEFO（或手工指定批次）分配并扣减库存，零售方上传支付凭证并确认收货。

export interface SalesOrderListQuery {
  status?: SalesStatus;
  page?: number;
  size?: number;
}

function toQuery(params: SalesOrderListQuery): string {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.size !== undefined) search.set('size', String(params.size));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function listSalesOrders(params: SalesOrderListQuery = {}): Promise<{
  items: SalesOrderDto[];
  total: number;
}> {
  return apiGet<{ items: SalesOrderDto[]; total: number }>(
    `/api/v1/sales-orders${toQuery(params)}`,
  );
}

export function getSalesOrder(id: string): Promise<SalesOrderDetailDto> {
  return apiGet<SalesOrderDetailDto>(`/api/v1/sales-orders/${id}`);
}

export function createSalesOrder(input: SalesOrderCreateInput): Promise<SalesOrderDetailDto> {
  return apiPost<SalesOrderDetailDto>('/api/v1/sales-orders', input);
}

export function updateSalesOrder(id: string, input: SalesOrderPatchInput): Promise<SalesOrderDetailDto> {
  return apiPatch<SalesOrderDetailDto>(`/api/v1/sales-orders/${id}`, input);
}

/** 发送：DRAFT → SENT；allocations 缺省按 FEFO 分配，指定时按批次扣减。 */
export function sendSalesOrder(id: string, input: SalesOrderSendInput): Promise<SalesOrderDetailDto> {
  return apiPost<SalesOrderDetailDto>(`/api/v1/sales-orders/${id}/send`, input);
}

/** 取消：确认收货前可取消，已分配库存按原批次回补。 */
export function cancelSalesOrder(id: string): Promise<SalesOrderDetailDto> {
  return apiPost<SalesOrderDetailDto>(`/api/v1/sales-orders/${id}/cancel`, {});
}

export function uploadSalePayment(id: string, input: SalesPaymentInput): Promise<PaymentDto> {
  return apiPost<PaymentDto>(`/api/v1/sales-orders/${id}/payments`, input);
}

export function confirmSaleReceipt(id: string): Promise<SalesOrderDetailDto> {
  return apiPost<SalesOrderDetailDto>(`/api/v1/sales-orders/${id}/confirm-receipt`, {});
}
