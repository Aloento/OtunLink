// 批次号兜底生成：batch_no 为空（NULL/空串）时生成可读批次号，保证不为 null。
// 格式：B-YYYYMMDD-XXXX（YYYYMMDD 取 UTC 日期；XXXX 为 4 位大写字母数字随机）。
export function ensureBatchNo(
  itemId: string,
  existing: string | null,
  date?: Date,
): string {
  const trimmed = existing?.trim();
  if (trimmed) return trimmed;
  const ymd = (date ?? new Date()).toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomUUID().slice(0, 4).toUpperCase();
  return `B-${ymd}-${suffix}`;
}
