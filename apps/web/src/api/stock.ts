import type { Paged, StockBatchDto, StockMovementDto, StockRowDto } from '@otunlink/shared';

import { apiGet } from './http';

// 库存台账 API 客户端（ck-08a / ck-08b）：仓库 × 物品 × 批次维度只读查询 + 效期批次。

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

export interface StockBatchListQuery {
  unitId?: string;
  itemId?: string;
}

function toBatchQuery(params: StockBatchListQuery): string {
  const search = new URLSearchParams();
  if (params.unitId) search.set('unitId', params.unitId);
  if (params.itemId) search.set('itemId', params.itemId);
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** 批次视图（含 productionDate / expiryDate / remainingDays / isExpired）。 */
export function listStockBatches(params: StockBatchListQuery = {}): Promise<{ items: StockBatchDto[] }> {
  return apiGet<{ items: StockBatchDto[] }>(`/api/v1/stock/batches${toBatchQuery(params)}`);
}

/** 已过期批次（仅剩余批次数量的维度；需 unitId 或账号 scope）。 */
export function listExpiredBatches(params: StockBatchListQuery = {}): Promise<{ items: StockBatchDto[] }> {
  return apiGet<{ items: StockBatchDto[] }>(`/api/v1/stock/expired${toBatchQuery(params)}`);
}
