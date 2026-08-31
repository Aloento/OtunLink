import type { RetailPriceDto, RetailPriceHistoryDto } from '@otunlink/shared';

import { apiGet, apiPut } from './http';

// 零售价 API 客户端（ck-08b §4.2）：仓库 × 物品当前价 + 改价历史。
// 原始 unit_cost 仅服务端计算并只读返回，任何写入入口都不接受该字段。

export interface RetailPriceListQuery {
  unitId?: string;
  itemId?: string;
}

export interface RetailPricePutInput {
  unitId: string;
  itemId: string;
  price: string;
  currency?: string;
}

function toQuery(params: RetailPriceListQuery): string {
  const search = new URLSearchParams();
  if (params.unitId) search.set('unitId', params.unitId);
  if (params.itemId) search.set('itemId', params.itemId);
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function listRetailPrices(params: RetailPriceListQuery = {}): Promise<{ items: RetailPriceDto[] }> {
  return apiGet<{ items: RetailPriceDto[] }>(`/api/v1/retail-prices${toQuery(params)}`);
}

export function putRetailPrice(input: RetailPricePutInput): Promise<RetailPriceDto> {
  return apiPut<RetailPriceDto>('/api/v1/retail-prices', input);
}

export function listRetailPriceHistory(
  unitId: string,
  itemId: string,
): Promise<{ items: RetailPriceHistoryDto[] }> {
  return apiGet<{ items: RetailPriceHistoryDto[] }>(
    `/api/v1/retail-prices/${encodeURIComponent(unitId)}/${encodeURIComponent(itemId)}/history`,
  );
}
