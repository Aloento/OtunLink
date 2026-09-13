// 内存实现共享工具：克隆、条码/SKU 生成与业务错误消息常量。

export const uuid = () => crypto.randomUUID();

export const SKU_ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function randomSkuCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SKU_ALPHANUM[Math.floor(Math.random() * SKU_ALPHANUM.length)];
  }
  return out;
}

export function normalizeEmpty<T extends string>(value: T | null | undefined): T | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim() as T;
  return trimmed.length > 0 ? trimmed : null;
}

export const INSUFFICIENT_STOCK_MESSAGE = 'INSUFFICIENT_STOCK: insufficient stock for outbound';

export const STOCK_BATCH_NOT_FOUND_MESSAGE =
  'STOCK_BATCH_NOT_FOUND: no stock of the specified batch in the warehouse';

// 销售单业务信号（路由层映射为对应错误码）。
export const SALES_STATE_CONFLICT_MESSAGE =
  'SALES_STATE_CONFLICT: sales order is not in the expected state';

export type SalesLineIssueReason = 'NO_LIST_PRICE' | 'CURRENCY_MISMATCH' | 'NO_BATCH_STOCK' | 'QTY_EXCEEDS_STOCK';

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
