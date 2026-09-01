const VALID_LENGTHS = new Set([8, 12, 13, 14]);

// 校验 GS1 GTIN 条码：仅数字、长度 8/12/13/14，且末位校验位正确。
export function isGtin(value: string): boolean {
  if (!value) return false;
  if (!/^\d+$/.test(value)) return false;
  if (!VALID_LENGTHS.has(value.length)) return false;

  const body = value.slice(0, -1);
  const check = Number(value[value.length - 1]);
  let sum = 0;
  let weight = 3;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === check;
}
