// SQL 仓库层共享工具：字面量转义、JSON/数组参数、日期与金额归一化。

export const quote = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
};

export const jsonb = (value: unknown): unknown => {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
};

/** `column IN (...)` 子句；空集合时恒 false（不泄露任何行）。 */
export const inClause = (column: string, values: string[]): string =>
  values.length > 0 ? `${column} IN (${values.map((v) => quote(v)).join(', ')})` : 'FALSE';

export const col = (name: string, value: unknown): string => `${name} = ${quote(value)}`;

/** uuid[] 列参数（PostgreSQL 数组字面量）。 */
export const photoArray = (ids: string[]): string =>
  ids.length > 0 ? `ARRAY[${ids.map((id) => quote(id)).join(', ')}]::uuid[]` : `ARRAY[]::uuid[]`;

// 将 undefined/空字符串归一化为 null（写入 DB 的 NULL）。
export function nn(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** jsonb 列归一化：pg 驱动返回已解析对象，部分桥接驱动返回字符串。 */
export function parseJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text.length === 0) return null;
    try {
      return JSON.parse(text);
    } catch {
      return value;
    }
  }
  return value;
}

// postgres.js 对 date 列返回 JS Date 对象；统一转为 YYYY-MM-DD（保持原日历日期）。
// 兼容已传入的 ISO 字符串，避免 String(Date).slice(0,10) 产生 "Sun Jun 01" 这类非法日期串。
export function toYMD(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function roundMoney(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function round2num(value: number): number {
  return Math.round(value * 100) / 100;
}
