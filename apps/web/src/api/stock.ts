import type { Paged, StockMovementDto, StockRowDto } from '@otunlink/shared';

import { apiGet } from './http';

// 库存台账 API 客户端（ck-08a）：仓库 × 物品 × 批次维度只读查询。

export interface StockListQuery {
  unitId?: string;
  itemId?: string;
  batchId?: string;
  page?: number;
  size?: number;
}

export interface StockMovementListQuery {
  unitId?: string;
  itemId?: string;
  batchId?: string;
  page?: number;
  size?: number;
}

function toQuery(params: StockListQuery | StockMovementListQuery): string {
  const search = new URLSearchParams();
  if (params.unitId) search.set('unitId', params.unitId);
  if (params.itemId) search.set('itemId', params.itemId);
  if (params.batchId) search.set('batchId', params.batchId);
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.size !== undefined) search.set('size', String(params.size));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function listStock(params: StockListQuery = {}): Promise<Paged<StockRowDto>> {
  return apiGet<Paged<StockRowDto>>(`/api/v1/stock${toQuery(params)}`);
}

export function listStockMovements(params: StockMovementListQuery = {}): Promise<Paged<StockMovementDto>> {
  return apiGet<Paged<StockMovementDto>>(`/api/v1/stock/movements${toQuery(params)}`);
}
