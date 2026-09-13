// SQL 数据访问实现（stopgap）：按领域拆分，跨领域依赖用显式工厂参数装配。
// 说明：生产最终应使用 Drizzle 查询构建（db.select().from(schema.users)...）走
// Hyperdrive/连接池；本实现受 SqlExecutor（仅 query(sql)）抽象约束，
// 采用「单引号转义 + RETURNING」的参数化等价写法，注入方式与 Drizzle 相同
// （Repository 接口），后续可无痛替换为 Drizzle 实现。
// 本地开发期间 PG 不可达（见 docs/db-setup.md），此处仅做正确性兜底，
// 单测覆盖走内存实现。
//
// ⚠️ Hyperdrive 会缓存只读查询且写操作不会使其失效：同一请求内禁止「写后按相同
// SQL 文本再读」，写入必须用 RETURNING 直接返回结果（见 docs/db-setup.md §6）。
import type { SqlExecutor } from '@otunlink/db';

import type { Repos } from '../../types';
import { createAuditLogsRepo } from './audit-logs';
import { createEmailLogsRepo } from './email-logs';
import { createFilesRepo } from './files';
import { createInboundsRepo } from './inbounds';
import { createItemsRepo } from './items';
import { createNotificationsRepo } from './notifications';
import { createOutboundsRepo } from './outbounds';
import { createPartnershipsRepo } from './partnerships';
import { createRetailPricesRepo } from './retail-prices';
import { createReturnsRepo } from './returns';
import { createSalesRepo } from './sales';
import { createShipmentsRepo } from './shipments';
import { createStockRepo } from './stock';
import { createUnitsRepo } from './units';
import { createUsersRepo } from './users';

export function createSqlRepos(exec: SqlExecutor): Repos {
  const users = createUsersRepo(exec);
  const units = createUnitsRepo(exec);
  const items = createItemsRepo(exec);
  const files = createFilesRepo(exec);
  const shipments = createShipmentsRepo(exec);
  const stock = createStockRepo(exec);
  const retailPrices = createRetailPricesRepo(exec);
  const sales = createSalesRepo(exec);
  const inbounds = createInboundsRepo(exec, { shipments });
  const returns = createReturnsRepo(exec, { shipments, sales });
  const outbounds = createOutboundsRepo(exec);
  const partnerships = createPartnershipsRepo(exec);
  const notifications = createNotificationsRepo(exec);
  const emailLogs = createEmailLogsRepo(exec);
  const auditLogs = createAuditLogsRepo(exec);

  return {
    users,
    units,
    items,
    files,
    shipments,
    inbounds,
    returns,
    outbounds,
    stock,
    retailPrices,
    sales,
    partnerships,
    notifications,
    emailLogs,
    auditLogs,
  };
}
