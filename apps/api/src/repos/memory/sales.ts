// 销售单内存仓库（sales_orders + items + allocations + payments）。
import type { CreateSalesRepoInput, PatchSalesInput, PaymentRecord, SalesAllocationInput, SalesBatchAllocationRecord, SalesListQuery, SalesListResult, SalesOrderItemRecord, SalesOrderRecord, SalesRepository } from '../../types';
import { INSUFFICIENT_STOCK_MESSAGE, SALES_STATE_CONFLICT_MESSAGE, STOCK_BATCH_NOT_FOUND_MESSAGE, normalizeEmpty, round2, uuid, type SalesLineIssueReason } from './helpers';
import type { MemoryItemRepository } from './items';
import type { MemoryStockLedger } from './ledger';
import type { MemoryRetailPriceRepository } from './retail-prices';
import type { MemoryUnitRepository } from './units';

const SALES_LINE_INVALID_MESSAGE = 'SALES_LINE_INVALID: sales order line is invalid';

interface SalesLineIssue {
  index: number;
  itemId: string;
  itemName: string | null;
  reason: SalesLineIssueReason;
  message: string;
}

function errorWithLineDetails(message: string, issues: SalesLineIssue[]): Error {
  const err = new Error(message);
  (err as { details?: unknown }).details = { lines: issues };
  return err;
}

function cloneSalesOrder(row: SalesOrderRecord): SalesOrderRecord {
  return {
    ...row,
    sentAt: row.sentAt ? new Date(row.sentAt) : null,
    confirmedAt: row.confirmedAt ? new Date(row.confirmedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function cloneSalesItem(row: SalesOrderItemRecord): SalesOrderItemRecord {
  return { ...row };
}

function clonePayment(row: PaymentRecord): PaymentRecord {
  return { ...row, uploadedAt: new Date(row.uploadedAt) };
}

/**
 * 内存销售单仓储：价格快照来自零售价（retailRepo），
 * 发送/取消复用共享台账（ledger.applyOutbound / 直接回补），与 SQL 实现行为对齐。
 */
export class MemorySalesRepository implements SalesRepository {
  private rows = new Map<string, SalesOrderRecord>();
  private items = new Map<string, SalesOrderItemRecord[]>();
  private allocRows: SalesBatchAllocationRecord[] = [];
  private payments = new Map<string, PaymentRecord>();
  private dailyCounters = new Map<string, number>();

  constructor(
    private readonly ledger: MemoryStockLedger,
    private readonly retailRepo: MemoryRetailPriceRepository,
    private readonly unitRepo: MemoryUnitRepository,
    private readonly itemRepo: MemoryItemRepository,
    seed: {
      salesOrders?: SalesOrderRecord[];
      salesItems?: SalesOrderItemRecord[];
      salesAllocations?: SalesBatchAllocationRecord[];
      payments?: PaymentRecord[];
    } = {},
  ) {
    for (const row of seed.salesOrders ?? []) this.rows.set(row.id, cloneSalesOrder(row));
    for (const row of seed.salesItems ?? []) {
      const list = this.items.get(row.salesOrderId) ?? [];
      list.push(cloneSalesItem(row));
      this.items.set(row.salesOrderId, list);
    }
    for (const row of seed.salesAllocations ?? []) this.allocRows.push({ ...row });
    for (const row of seed.payments ?? []) this.payments.set(row.salesOrderId, clonePayment(row));
  }

  private withPayment(row: SalesOrderRecord): SalesOrderRecord {
    return { ...cloneSalesOrder(row), hasPayment: this.payments.has(row.id) || row.hasPayment };
  }

  private nextSalesNo(): string {
    const key = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const next = (this.dailyCounters.get(key) ?? 0) + 1;
    this.dailyCounters.set(key, next);
    return `SO-${key}-${String(next).padStart(4, '0')}`;
  }

  /**
   * 价格快照：零售价取自定义的默认零售价（保留它自己的货币），成交价恒为本单货币。
   * 零售价货币与本单货币不一致时必须行级改价（不做货币换算）；两者皆无则置 null（发送时校验）。
   */
  private async snapshotLines(
    sellerUnitId: string,
    orderCurrency: string,
    lines: CreateSalesRepoInput['items'],
  ): Promise<{
    itemId: string;
    qty: string;
    listPrice: string | null;
    listPriceCurrency: string | null;
    price: string | null;
    lineTotal: string | null;
  }[]> {
    const issues: SalesLineIssue[] = [];
    const result: {
      itemId: string;
      qty: string;
      listPrice: string | null;
      listPriceCurrency: string | null;
      price: string | null;
      lineTotal: string | null;
    }[] = [];
    for (const [index, line] of lines.entries()) {
      const snapshot = (await this.retailRepo.list({ unitId: sellerUnitId, itemId: line.itemId }))[0] ?? null;
      const override = line.unitPriceOverride ? String(line.unitPriceOverride) : null;
      if (override === null && snapshot && snapshot.currency !== orderCurrency) {
        const itemName = snapshot.itemName ?? (await this.itemRepo.findById(line.itemId))?.name ?? null;
        issues.push({
          index: index + 1,
          itemId: line.itemId,
          itemName,
          reason: 'CURRENCY_MISMATCH',
          message: `第${index + 1}行（${itemName ?? '未知物品'}）：默认零售价货币 ${snapshot.currency} 与本单货币 ${orderCurrency} 不一致，请填写行级改价`,
        });
      }
      const price = override ?? snapshot?.price ?? null;
      result.push({
        itemId: line.itemId,
        qty: line.qty,
        listPrice: snapshot?.price ?? null,
        listPriceCurrency: snapshot?.currency ?? null,
        price,
        lineTotal: price === null ? null : round2(Number(line.qty) * Number(price)).toFixed(2),
      });
    }
    if (issues.length > 0) throw errorWithLineDetails(SALES_LINE_INVALID_MESSAGE, issues);
    return result;
  }

  private calcTotal(lines: { lineTotal: string | null }[], discountPercent: string, freight: string): string {
    const subtotal = lines.reduce((sum, l) => sum + Number(l.lineTotal ?? 0), 0);
    return round2(subtotal * (1 - Number(discountPercent) / 100) + Number(freight)).toFixed(2);
  }

  async list(query: SalesListQuery): Promise<SalesListResult> {
    const all = [...this.rows.values()]
      .filter((row) => (query.status ? row.status === query.status : true))
      .filter((row) =>
        query.unitId ? row.sellerUnitId === query.unitId || row.buyerUnitId === query.unitId : true,
      )
      .filter((row) => (query.buyerUnitId ? row.buyerUnitId === query.buyerUnitId : true))
      .filter((row) => (query.sellerUnitIds ? query.sellerUnitIds.includes(row.sellerUnitId) : true))
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id),
      );
    const size = Math.min(Math.max(query.size ?? 20, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * size;
    return {
      items: all.slice(start, start + size).map((row) => this.withPayment(row)),
      total: all.length,
      page,
      size,
    };
  }

  async findById(id: string): Promise<SalesOrderRecord | null> {
    const row = this.rows.get(id);
    return row ? this.withPayment(row) : null;
  }

  async listItems(salesOrderId: string): Promise<SalesOrderItemRecord[]> {
    const rows = this.items.get(salesOrderId) ?? [];
    const hydrated: SalesOrderItemRecord[] = [];
    for (const row of rows) {
      const item = await this.itemRepo.findById(row.itemId);
      hydrated.push({
        ...row,
        itemName: row.itemName ?? item?.name ?? null,
        spec: row.spec ?? (item ? (item.minSaleUnit === 'INNER' ? item.innerUnit : item.specUnit) : null),
        minSaleUnit: item?.minSaleUnit ?? null,
      });
    }
    return hydrated;
  }

  async listAllocations(salesOrderId: string): Promise<SalesBatchAllocationRecord[]> {
    const orderItemIds = new Set((this.items.get(salesOrderId) ?? []).map((i) => i.id));
    return this.allocRows
      .filter((a) => orderItemIds.has(a.orderItemId))
      .map((a) => {
        const batch = this.ledger.batches.get(a.batchId);
        return {
          ...a,
          batchNo: a.batchNo ?? batch?.batchNo ?? null,
          expiryDate: a.expiryDate ?? batch?.expiryDate ?? null,
        };
      });
  }

  async findPayment(salesOrderId: string): Promise<PaymentRecord | null> {
    const row = this.payments.get(salesOrderId);
    return row ? clonePayment(row) : null;
  }

  async create(input: CreateSalesRepoInput): Promise<SalesOrderRecord> {
    const now = new Date();
    const lines = await this.snapshotLines(input.sellerUnitId, input.currency, input.items);
    const order: SalesOrderRecord = {
      id: uuid(),
      salesNo: this.nextSalesNo(),
      sellerUnitId: input.sellerUnitId,
      buyerUnitId: input.buyerUnitId,
      source: input.source,
      deliveryMethod: input.deliveryMethod,
      deliveryAddress: normalizeEmpty(input.deliveryAddress),
      carrier: normalizeEmpty(input.carrier),
      trackingNo: normalizeEmpty(input.trackingNo),
      freight: input.freight,
      discountPercent: input.discountPercent,
      currency: input.currency,
      totalAmount: this.calcTotal(lines, input.discountPercent, input.freight),
      status: 'DRAFT',
      remark: normalizeEmpty(input.remark),
      sentAt: null,
      confirmedAt: null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      hasPayment: false,
    };
    this.rows.set(order.id, cloneSalesOrder(order));
    this.items.set(
      order.id,
      lines.map((line) => ({
        id: uuid(),
        salesOrderId: order.id,
        itemId: line.itemId,
        itemName: null,
        spec: null,
        minSaleUnit: null,
        qty: line.qty,
        listPrice: line.listPrice,
        listPriceCurrency: line.listPriceCurrency,
        price: line.price,
        lineTotal: line.lineTotal,
      })),
    );
    return this.withPayment(order);
  }

  async update(id: string, input: PatchSalesInput): Promise<SalesOrderRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'DRAFT') throw new Error(SALES_STATE_CONFLICT_MESSAGE);

    const now = new Date();
    let lines: {
      lineTotal: string | null;
      itemId: string;
      qty: string;
      listPrice: string | null;
      listPriceCurrency: string | null;
      price: string | null;
    }[] | null = null;
    if (input.items) {
      lines = await this.snapshotLines(
        existing.sellerUnitId,
        input.currency ?? existing.currency,
        input.items,
      );
      this.items.set(
        id,
        lines.map((line) => ({
          id: uuid(),
          salesOrderId: id,
          itemId: line.itemId,
          itemName: null,
          spec: null,
          minSaleUnit: null,
          qty: line.qty,
          listPrice: line.listPrice,
          listPriceCurrency: line.listPriceCurrency,
          price: line.price,
          lineTotal: line.lineTotal,
        })),
      );
    }
    const currentLines =
      lines ??
      (this.items.get(id) ?? []).map((l) => ({ lineTotal: l.lineTotal ?? '0' }));
    const freight = input.freight ?? existing.freight;
    const discountPercent = input.discountPercent ?? existing.discountPercent;
    const next: SalesOrderRecord = {
      ...existing,
      deliveryMethod: input.deliveryMethod ?? existing.deliveryMethod,
      deliveryAddress:
        input.deliveryAddress !== undefined ? normalizeEmpty(input.deliveryAddress) : existing.deliveryAddress,
      carrier: input.carrier !== undefined ? normalizeEmpty(input.carrier) : existing.carrier,
      trackingNo:
        input.trackingNo !== undefined ? normalizeEmpty(input.trackingNo) : existing.trackingNo,
      freight,
      discountPercent,
      currency: input.currency ?? existing.currency,
      remark: input.remark !== undefined ? normalizeEmpty(input.remark) : existing.remark,
      totalAmount: this.calcTotal(currentLines, discountPercent, freight),
      updatedAt: now,
    };
    this.rows.set(id, cloneSalesOrder(next));
    return this.withPayment(next);
  }

  async send(
    id: string,
    allocations: SalesAllocationInput[],
    sentBy: string,
    options: { carrier?: string | null; trackingNo?: string | null } = {},
  ): Promise<SalesOrderRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'DRAFT') throw new Error(SALES_STATE_CONFLICT_MESSAGE);

    const rows = this.items.get(id) ?? [];
    const lines = await Promise.all(
      rows.map(async (line, index) => {
        const item = line.itemName ? null : await this.itemRepo.findById(line.itemId);
        return {
          index: index + 1,
          orderItemId: line.id,
          itemId: line.itemId,
          qty: Number(line.qty),
          listPrice: line.listPrice,
          price: line.price,
          itemName: line.itemName ?? item?.name ?? null,
        };
      }),
    );
    const lineByItem = new Map<string, { orderItemId: string; qty: number }>();
    for (const line of lines) {
      lineByItem.set(line.itemId, { orderItemId: line.orderItemId, qty: line.qty });
    }

    // 发送时逐行校验价格：无零售价且无行级改价 → 400（带行级明细）。
    const noPriceLines = lines.filter((l) => l.price === null || l.price === '');
    if (noPriceLines.length > 0) {
      throw errorWithLineDetails(
        SALES_LINE_INVALID_MESSAGE,
        noPriceLines.map((l) => ({
          index: l.index,
          itemId: l.itemId,
          itemName: l.itemName,
          reason: 'NO_LIST_PRICE' as const,
          message: `第${l.index}行（${l.itemName ?? '未知物品'}）：未设置零售价且未填写行级改价，无法发送`,
        })),
      );
    }

    const lineInfoOf = (itemId: string) => lines.find((l) => l.itemId === itemId) ?? null;
    const manualByItem = new Map<string, { batchId: string; qty: number }[]>();
    for (const allocLine of allocations) {
      if (!lineByItem.has(allocLine.itemId)) {
        throw errorWithLineDetails(SALES_LINE_INVALID_MESSAGE, [
          {
            index: 0,
            itemId: allocLine.itemId,
            itemName: null,
            reason: 'NO_BATCH_STOCK',
            message: `手工分配引用了订单中不存在的物品（${allocLine.itemId}）`,
          },
        ]);
      }
      const list = manualByItem.get(allocLine.itemId) ?? [];
      list.push({ batchId: allocLine.batchId, qty: Number(allocLine.qty) });
      manualByItem.set(allocLine.itemId, list);
    }
    for (const [itemId, list] of manualByItem) {
      const line = lineByItem.get(itemId)!;
      const total = list.reduce((sum, a) => sum + a.qty, 0);
      if (Math.abs(total - line.qty) > 0.001) {
        const info = lineInfoOf(itemId);
        throw errorWithLineDetails(SALES_LINE_INVALID_MESSAGE, [
          {
            index: info?.index ?? 0,
            itemId,
            itemName: info?.itemName ?? null,
            reason: 'QTY_EXCEEDS_STOCK',
            message: `第${info?.index ?? '?'}行（${info?.itemName ?? '未知物品'}）：手工分配数量与行数量不一致`,
          },
        ]);
      }
    }

    const now = new Date();
    for (const [itemId, line] of lineByItem) {
      const info = lineInfoOf(itemId);
      const manual = manualByItem.get(itemId);
      if (manual) {
        for (const allocLine of manual) {
          try {
            const allocationsOf = this.ledger.applyOutbound({
              unitId: existing.sellerUnitId,
              itemId,
              qty: allocLine.qty,
              batchId: allocLine.batchId,
              type: 'OUTBOUND_SALE',
              orderType: 'sales',
              orderId: existing.id,
              refNo: existing.salesNo,
              operatorId: sentBy,
            });
            for (const alloc of allocationsOf) {
              this.allocRows.push(this.allocRow(line.orderItemId, itemId, alloc, now));
            }
          } catch (cause) {
            if (cause instanceof Error) {
              if (cause.message.includes('STOCK_BATCH_NOT_FOUND')) {
                throw errorWithLineDetails(STOCK_BATCH_NOT_FOUND_MESSAGE, [
                  {
                    index: info?.index ?? 0,
                    itemId,
                    itemName: info?.itemName ?? null,
                    reason: 'NO_BATCH_STOCK',
                    message: `第${info?.index ?? '?'}行（${info?.itemName ?? '未知物品'}）：指定批次在当前仓库无库存`,
                  },
                ]);
              }
              if (cause.message.includes('INSUFFICIENT_STOCK')) {
                throw errorWithLineDetails(INSUFFICIENT_STOCK_MESSAGE, [
                  {
                    index: info?.index ?? 0,
                    itemId,
                    itemName: info?.itemName ?? null,
                    reason: 'QTY_EXCEEDS_STOCK',
                    message: `第${info?.index ?? '?'}行（${info?.itemName ?? '未知物品'}）：库存不足，无法发送`,
                  },
                ]);
              }
            }
            throw cause;
          }
        }
      } else {
        try {
          const allocationsOf = this.ledger.applyOutbound({
            unitId: existing.sellerUnitId,
            itemId,
            qty: line.qty,
            batchId: null,
            type: 'OUTBOUND_SALE',
            orderType: 'sales',
            orderId: existing.id,
            refNo: existing.salesNo,
            operatorId: sentBy,
          });
          for (const alloc of allocationsOf) {
            this.allocRows.push(this.allocRow(line.orderItemId, itemId, alloc, now));
          }
        } catch (cause) {
          if (cause instanceof Error && cause.message.includes('INSUFFICIENT_STOCK')) {
            throw errorWithLineDetails(INSUFFICIENT_STOCK_MESSAGE, [
              {
                index: info?.index ?? 0,
                itemId,
                itemName: info?.itemName ?? null,
                reason: 'QTY_EXCEEDS_STOCK',
                message: `第${info?.index ?? '?'}行（${info?.itemName ?? '未知物品'}）：库存不足，无法发送`,
              },
            ]);
          }
          throw cause;
        }
      }
    }

    const next: SalesOrderRecord = {
      ...existing,
      status: 'SENT',
      sentAt: now,
      updatedAt: now,
      carrier:
        options.carrier !== undefined && options.carrier !== null
          ? normalizeEmpty(options.carrier)
          : existing.carrier,
      trackingNo:
        options.trackingNo !== undefined && options.trackingNo !== null
          ? normalizeEmpty(options.trackingNo)
          : existing.trackingNo,
    };
    this.rows.set(id, cloneSalesOrder(next));
    return this.withPayment(next);
  }

  private allocRow(
    orderItemId: string,
    itemId: string,
    alloc: { batchId: string; qty: number; unitCost: number },
    now: Date,
  ): SalesBatchAllocationRecord {
    const batch = this.ledger.batches.get(alloc.batchId);
    return {
      id: uuid(),
      orderItemId,
      itemId,
      itemName: null,
      batchId: alloc.batchId,
      batchNo: batch?.batchNo ?? null,
      expiryDate: batch?.expiryDate ?? null,
      qty: alloc.qty.toFixed(2),
    };
  }

  async cancel(id: string, cancelledBy: string): Promise<SalesOrderRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status === 'CONFIRMED' || existing.status === 'CANCELLED') {
      throw new Error(SALES_STATE_CONFLICT_MESSAGE);
    }

    const now = new Date();
    if (existing.status !== 'DRAFT') {
      const orderItemIds = new Set((this.items.get(id) ?? []).map((i) => i.id));
      for (const a of this.allocRows.filter((row) => orderItemIds.has(row.orderItemId))) {
        const allocQty = Number(a.qty);
        const original = this.ledger.movements
          .filter(
            (m) =>
              m.orderType === 'sales' &&
              m.orderId === id &&
              m.batchId === a.batchId &&
              m.type === 'OUTBOUND_SALE',
          )
          .slice(-1)[0];
        const unitCost = original?.unitCost ?? 0;
        const key = this.ledger.stockKey(existing.sellerUnitId, a.itemId, a.batchId);
        const before = this.ledger.stock.get(key);
        const qtyBefore = before ? before.qty : 0;
        const qtyAfter = round2(qtyBefore + allocQty);
        this.ledger.stock.set(key, {
          unitId: existing.sellerUnitId,
          itemId: a.itemId,
          batchId: a.batchId,
          qty: qtyAfter,
          avgCost: before ? before.avgCost : unitCost,
          version: (before ? before.version : 0) + 1,
          updatedAt: now,
        });
        this.ledger.movements.push({
          unitId: existing.sellerUnitId,
          itemId: a.itemId,
          batchId: a.batchId,
          type: 'OUTBOUND_SALE_REVERSAL',
          qtyDelta: round2(allocQty),
          qtyBefore: round2(qtyBefore),
          qtyAfter,
          unitCost,
          orderType: 'sales',
          orderId: existing.id,
          refNo: existing.salesNo,
          operatorId: cancelledBy,
          createdAt: now,
        });
      }
      const payment = this.payments.get(id);
      if (payment) {
        this.payments.set(id, {
          ...payment,
          refundNote: payment.refundNote ?? '销售单已取消，退款线下处理',
        });
      }
    }
    const next: SalesOrderRecord = { ...existing, status: 'CANCELLED', updatedAt: now };
    this.rows.set(id, cloneSalesOrder(next));
    return this.withPayment(next);
  }

  async uploadPayment(
    id: string,
    input: { amount: string; currency: string; methodNote: string | null; proofFileId: string | null; uploadedBy: string },
  ): Promise<PaymentRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'SENT' && existing.status !== 'PAYMENT_UPLOADED') {
      throw new Error(SALES_STATE_CONFLICT_MESSAGE);
    }
    const now = new Date();
    const previous = this.payments.get(id);
    const payment: PaymentRecord = {
      id: previous?.id ?? uuid(),
      salesOrderId: id,
      amount: input.amount,
      currency: input.currency,
      methodNote: normalizeEmpty(input.methodNote),
      proofFileId: normalizeEmpty(input.proofFileId),
      refundNote: previous?.refundNote ?? null,
      uploadedBy: input.uploadedBy,
      uploadedAt: now,
    };
    this.payments.set(id, clonePayment(payment));
    const next: SalesOrderRecord = { ...existing, status: 'PAYMENT_UPLOADED', updatedAt: now };
    this.rows.set(id, cloneSalesOrder(next));
    return clonePayment(payment);
  }

  async confirmReceipt(id: string, confirmedBy: string): Promise<SalesOrderRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'PAYMENT_UPLOADED') throw new Error(SALES_STATE_CONFLICT_MESSAGE);
    const now = new Date();
    const next: SalesOrderRecord = {
      ...existing,
      status: 'CONFIRMED',
      confirmedAt: now,
      updatedAt: now,
    };
    this.rows.set(id, cloneSalesOrder(next));
    return this.withPayment(next);
  }

  referencesItem(itemId: string): boolean {
    for (const rows of this.items.values()) {
      if (rows.some((row) => row.itemId === itemId)) return true;
    }
    return false;
  }

  referencesUnit(unitId: string): boolean {
    for (const row of this.rows.values()) {
      if (row.sellerUnitId === unitId || row.buyerUnitId === unitId) return true;
    }
    return false;
  }

  async delete(id: string): Promise<boolean> {
    const existing = this.rows.get(id);
    if (!existing) return false;
    if (existing.status !== 'DRAFT') throw new Error(SALES_STATE_CONFLICT_MESSAGE);
    const itemIds = new Set((this.items.get(id) ?? []).map((row) => row.id));
    this.allocRows = this.allocRows.filter((row) => !itemIds.has(row.orderItemId));
    this.items.delete(id);
    this.payments.delete(id);
    return this.rows.delete(id);
  }
}
