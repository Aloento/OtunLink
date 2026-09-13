// 单据号生成：前缀 + 库内计数自增，冲突时顺延重试。
import type { SqlExecutor } from '@otunlink/db';
import { quote } from './helpers';

export async function nextInboundNo(exec: SqlExecutor): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `IB-${date}-`;
  const countResult = await exec.query(
    `SELECT count(*)::int AS n FROM inbound_orders WHERE inbound_no LIKE ${quote(`${prefix}%`)}`,
  );
  const base = Number(countResult.rows[0]?.n ?? 0) + 1;
  let no = `${prefix}${String(base).padStart(4, '0')}`;
  for (let attempt = 0; attempt < 50; attempt++) {
    const exists = await exec.query(
      `SELECT count(*)::int AS n FROM inbound_orders WHERE inbound_no = ${quote(no)}`,
    );
    if (Number(exists.rows[0]?.n ?? 0) === 0) break;
    no = `${prefix}${String(base + attempt + 1).padStart(4, '0')}`;
  }
  return no;
}

export async function nextReturnNo(exec: SqlExecutor): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `RT-${date}-`;
  const countResult = await exec.query(
    `SELECT count(*)::int AS n FROM return_orders WHERE return_no LIKE ${quote(`${prefix}%`)}`,
  );
  const base = Number(countResult.rows[0]?.n ?? 0) + 1;
  let no = `${prefix}${String(base).padStart(4, '0')}`;
  for (let attempt = 0; attempt < 50; attempt++) {
    const exists = await exec.query(
      `SELECT count(*)::int AS n FROM return_orders WHERE return_no = ${quote(no)}`,
    );
    if (Number(exists.rows[0]?.n ?? 0) === 0) break;
    no = `${prefix}${String(base + attempt + 1).padStart(4, '0')}`;
  }
  return no;
}

export async function nextOutboundNo(exec: SqlExecutor): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `OB-${date}-`;
  const countResult = await exec.query(
    `SELECT count(*)::int AS n FROM outbound_orders WHERE outbound_no LIKE ${quote(`${prefix}%`)}`,
  );
  const base = Number(countResult.rows[0]?.n ?? 0) + 1;
  let no = `${prefix}${String(base).padStart(4, '0')}`;
  for (let attempt = 0; attempt < 50; attempt++) {
    const exists = await exec.query(
      `SELECT count(*)::int AS n FROM outbound_orders WHERE outbound_no = ${quote(no)}`,
    );
    if (Number(exists.rows[0]?.n ?? 0) === 0) break;
    no = `${prefix}${String(base + attempt + 1).padStart(4, '0')}`;
  }
  return no;
}

export async function nextSalesNo(exec: SqlExecutor): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `SO-${date}-`;
  const countResult = await exec.query(
    `SELECT count(*)::int AS n FROM sales_orders WHERE sales_no LIKE ${quote(`${prefix}%`)}`,
  );
  const base = Number(countResult.rows[0]?.n ?? 0) + 1;
  let no = `${prefix}${String(base).padStart(4, '0')}`;
  for (let attempt = 0; attempt < 50; attempt++) {
    const exists = await exec.query(
      `SELECT count(*)::int AS n FROM sales_orders WHERE sales_no = ${quote(no)}`,
    );
    if (Number(exists.rows[0]?.n ?? 0) === 0) break;
    no = `${prefix}${String(base + attempt + 1).padStart(4, '0')}`;
  }
  return no;
}
