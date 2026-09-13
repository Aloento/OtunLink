// 内存仓库入口：按领域装配内存实现，生产必须走 Drizzle（见 repos/sql/ 注释）。
import type { DiscrepancyReviewRecord, FileRecord, InboundOrderItemRecord, InboundOrderRecord, ItemRecord, OutboundOrderItemRecord, OutboundOrderRecord, PartnershipRecord, PaymentRecord, Repos, ReturnOrderItemRecord, ReturnOrderRecord, SalesBatchAllocationRecord, SalesOrderItemRecord, SalesOrderRecord, ShipmentItemRecord, ShipmentRecord, ShipmentTrackingRecord, UnitRecord, UserRecord } from '../../types';
import { MemoryAuditLogRepository } from './audit-logs';
import { MemoryEmailLogRepository } from './email-logs';
import { MemoryFileRepository } from './files';
import { MemoryInboundRepository } from './inbounds';
import { MemoryItemRepository } from './items';
import { MemoryStockLedger } from './ledger';
import { MemoryNotificationRepository } from './notifications';
import { MemoryOutboundRepository } from './outbounds';
import { MemoryPartnershipRepository } from './partnerships';
import { MemoryRetailPriceRepository } from './retail-prices';
import { MemoryReturnRepository } from './returns';
import { MemorySalesRepository } from './sales';
import { MemoryShipmentRepository } from './shipments';
import { MemoryStockRepository } from './stock';
import { MemoryUnitRepository } from './units';
import { MemoryUserRepository } from './users';

export function createMemoryRepos(seed?: {
  users?: UserRecord[];
  units?: UnitRecord[];
  items?: ItemRecord[];
  files?: FileRecord[];
  shipments?: ShipmentRecord[];
  shipmentTrackings?: ShipmentTrackingRecord[];
  shipmentItems?: ShipmentItemRecord[];
  reviews?: DiscrepancyReviewRecord[];
  inbounds?: InboundOrderRecord[];
  inboundItems?: InboundOrderItemRecord[];
  returns?: ReturnOrderRecord[];
  returnItems?: ReturnOrderItemRecord[];
  outbounds?: OutboundOrderRecord[];
  outboundItems?: OutboundOrderItemRecord[];
  salesOrders?: SalesOrderRecord[];
  salesItems?: SalesOrderItemRecord[];
  salesAllocations?: SalesBatchAllocationRecord[];
  payments?: PaymentRecord[];
  partnerships?: PartnershipRecord[];
}): Repos {
  const stockLedger = new MemoryStockLedger();
  const itemRepo = new MemoryItemRepository(seed?.items);
  const shipmentRepo = new MemoryShipmentRepository(itemRepo, {
    shipments: seed?.shipments,
    trackings: seed?.shipmentTrackings,
    items: seed?.shipmentItems,
    reviews: seed?.reviews,
  });
  const unitRepo = new MemoryUnitRepository(seed?.units);
  const inboundRepo = new MemoryInboundRepository(
    shipmentRepo,
    itemRepo,
    {
      inbounds: seed?.inbounds,
      inboundItems: seed?.inboundItems,
    },
    stockLedger,
  );
  const userRepo = new MemoryUserRepository(seed?.users);
  const retailPriceRepo = new MemoryRetailPriceRepository(stockLedger, unitRepo, itemRepo, userRepo);
  const salesRepo = new MemorySalesRepository(stockLedger, retailPriceRepo, unitRepo, itemRepo, {
    salesOrders: seed?.salesOrders,
    salesItems: seed?.salesItems,
    salesAllocations: seed?.salesAllocations,
    payments: seed?.payments,
  });
  const returnRepo = new MemoryReturnRepository(shipmentRepo, inboundRepo, salesRepo, stockLedger, {
    returns: seed?.returns,
    returnItems: seed?.returnItems,
  });
  const outboundRepo = new MemoryOutboundRepository(stockLedger, {
    outbounds: seed?.outbounds,
    outboundItems: seed?.outboundItems,
  });
  const partnershipRepo = new MemoryPartnershipRepository(unitRepo, seed?.partnerships);
  const notificationRepo = new MemoryNotificationRepository();

  // 物品删除前的引用检查：任一单据/库存/零售价引用该物品即视为占用。
  itemRepo.addReferenceChecker((itemId) => shipmentRepo.referencesItem(itemId));
  itemRepo.addReferenceChecker((itemId) => inboundRepo.referencesItem(itemId));
  itemRepo.addReferenceChecker((itemId) => outboundRepo.referencesItem(itemId));
  itemRepo.addReferenceChecker((itemId) => salesRepo.referencesItem(itemId));
  itemRepo.addReferenceChecker((itemId) => returnRepo.referencesItem(itemId));
  itemRepo.addReferenceChecker((itemId) => retailPriceRepo.referencesItem(itemId));
  itemRepo.addReferenceChecker((itemId) =>
    [...stockLedger.batches.values()].some((row) => row.itemId === itemId),
  );
  itemRepo.addReferenceChecker((itemId) =>
    [...stockLedger.stock.values()].some((row) => row.itemId === itemId),
  );
  itemRepo.addReferenceChecker((itemId) =>
    stockLedger.movements.some((row) => row.itemId === itemId),
  );

  // 单元删除前的引用检查：任一单据/库存/价格/签约/通知/用户范围引用该单元即视为占用。
  unitRepo.addReferenceChecker((unitId) => shipmentRepo.referencesUnit(unitId));
  unitRepo.addReferenceChecker((unitId) => inboundRepo.referencesUnit(unitId));
  unitRepo.addReferenceChecker((unitId) => outboundRepo.referencesUnit(unitId));
  unitRepo.addReferenceChecker((unitId) => salesRepo.referencesUnit(unitId));
  unitRepo.addReferenceChecker((unitId) => returnRepo.referencesUnit(unitId));
  unitRepo.addReferenceChecker((unitId) => retailPriceRepo.referencesUnit(unitId));
  unitRepo.addReferenceChecker((unitId) => partnershipRepo.referencesUnit(unitId));
  unitRepo.addReferenceChecker((unitId) => notificationRepo.referencesUnit(unitId));
  unitRepo.addReferenceChecker((unitId) => userRepo.referencesUnit(unitId));
  unitRepo.addReferenceChecker((unitId) =>
    [...stockLedger.stock.values()].some((row) => row.unitId === unitId),
  );
  unitRepo.addReferenceChecker((unitId) =>
    stockLedger.movements.some((row) => row.unitId === unitId),
  );

  return {
    users: userRepo,
    units: unitRepo,
    items: itemRepo,
    files: new MemoryFileRepository(seed?.files),
    shipments: shipmentRepo,
    inbounds: inboundRepo,
    returns: returnRepo,
    outbounds: outboundRepo,
    stock: new MemoryStockRepository(stockLedger, unitRepo, itemRepo),
    retailPrices: retailPriceRepo,
    sales: salesRepo,
    partnerships: partnershipRepo,
    notifications: notificationRepo,
    emailLogs: new MemoryEmailLogRepository(),
    auditLogs: new MemoryAuditLogRepository(),
  };
}
