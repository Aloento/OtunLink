import { z } from 'zod';

import { UNIT_TYPES, USER_ROLES, USER_STATUSES } from './auth';
import { CURRENCIES, ITEM_STATUSES, SPEC_UNITS } from './items';
import { OUTBOUND_TYPES } from './outbound';
import { DELIVERY_METHODS, SALES_SOURCES } from './sales';

// 认证/岗位/业务单元相关的请求校验。
// 放在 shared 供 api 使用；api 包不直接依赖 zod，通过 shared 复用。

const uuid = () => z.uuid();
const role = () => z.enum(USER_ROLES);
const status = () => z.enum(USER_STATUSES);
const unitType = () => z.enum(UNIT_TYPES);

/** 用户自助更新（GET/PATCH /users/me）：仅名称与语言偏好。 */
export const userSelfPatchSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  locale: z.string().trim().min(2).max(8).optional(),
});

/** 管理员新建用户（POST /admin/users）：entra_sub/email/name 必填。 */
export const adminUserCreateSchema = z.object({
  entraSub: z.string().trim().min(1).max(128),
  email: z.string().trim().email().max(256),
  name: z.string().trim().min(1).max(128),
  role: role().optional(),
  scopeUnitId: uuid().nullable().optional(),
  status: status().optional(),
  locale: z.string().trim().min(2).max(8).optional(),
});

/** 管理员更新用户（PATCH /admin/users/:id）：分配岗位与数据范围。 */
export const adminUserPatchSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  role: role().optional(),
  scopeUnitId: uuid().nullable().optional(),
  status: status().optional(),
  locale: z.string().trim().min(2).max(8).optional(),
});

/** 新建业务单元（POST /admin/units）。 */
export const unitCreateSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(128),
  type: unitType(),
  address: z.string().trim().max(1024).optional(),
  contact: z.string().trim().max(512).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  baseCurrency: z.string().trim().length(3).optional(),
  isActive: z.boolean().optional(),
});

/** 更新业务单元（PATCH /admin/units/:id）。 */
export const unitPatchSchema = z.object({
  code: z.string().trim().min(1).max(32).optional(),
  name: z.string().trim().min(1).max(128).optional(),
  type: unitType().optional(),
  address: z.string().trim().max(1024).nullable().optional(),
  contact: z.string().trim().max(512).nullable().optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  baseCurrency: z.string().trim().length(3).optional(),
  isActive: z.boolean().optional(),
});

const specUnit = () => z.enum(SPEC_UNITS);
const currency = () => z.enum(CURRENCIES);
const itemStatus = () => z.enum(ITEM_STATUSES);

const innerCountSchema = z
  .union([
    z.number().nonnegative(),
    z.string().trim().regex(/^\d+(\.\d+)?$/),
  ])
  .transform((value) => String(value));

const BARCODE_MESSAGE = '条码必须为 8/12/13/14 位数字且校验位正确';

/**
 * 标准商品条码（GTIN-8/12/13/14）：纯数字、长度 ∈ {8,12,13,14}，且末位校验位正确。
 * 校验位 = (10 - 权重和 % 10) % 10，权重：从右往左（不含校验位）奇数位 ×3、偶数位 ×1。
 */
export function isValidGtin(value: string): boolean {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(value)) return false;
  const digits = [...value].map((ch) => Number(ch));
  const check = digits[digits.length - 1];
  let sum = 0;
  for (let i = 0; i < digits.length - 1; i++) {
    const fromRight = digits.length - 1 - i;
    sum += digits[i] * (fromRight % 2 === 1 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** 条码：trim 后允许空串（视为未填）；非空必须通过 GTIN 校验。 */
const barcodeValue = z
  .string()
  .trim()
  .refine((value) => value === '' || isValidGtin(value), BARCODE_MESSAGE);

/** 新建物品（POST /items）。条码可空；spec_unit 默认 PIECE。 */
export const itemCreateSchema = z.object({
  sku: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1).max(256),
  barcode: barcodeValue.optional(),
  specUnit: specUnit().optional(),
  innerUnit: specUnit().optional(),
  innerCount: innerCountSchema.optional(),
  isPerishable: z.boolean().optional(),
  category: z.string().trim().max(128).optional(),
  description: z.string().trim().max(4096).optional(),
  status: itemStatus().optional(),
  /** 新建后关联的图片文件 id（可选，走 POST /files 预上传）。 */
  fileIds: z.array(z.uuid()).max(20).optional(),
});

/** 关联图片到物品（POST /items/:id/images）。 */
export const itemAttachImagesSchema = z.object({
  fileIds: z.array(z.uuid()).min(1).max(20),
});

/** 更新物品（PATCH /items/:id）。空字符串语义上等同 null（清除字段）。 */
export const itemPatchSchema = z.object({
  sku: z.string().trim().max(64).optional().nullable(),
  name: z.string().trim().min(1).max(256).optional(),
  barcode: barcodeValue.optional().nullable(),
  specUnit: specUnit().optional(),
  innerUnit: specUnit().optional().nullable(),
  innerCount: innerCountSchema.optional().nullable(),
  isPerishable: z.boolean().optional(),
  category: z.string().trim().max(128).optional().nullable(),
  description: z.string().trim().max(4096).optional().nullable(),
  status: itemStatus().optional(),
});

// ── 发货单────────────────────────────────────────────────────────

const dateOnly = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

/** 数量：number 或数字字符串，> 0，统一转为字符串（DB numeric 以文本回读）。 */
const shipmentQty = z
  .union([
    z.number().positive(),
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/)
      .refine((value) => Number(value) > 0, { message: '数量必须大于 0' }),
  ])
  .transform((value) => String(value));

/** 实收数量：>= 0（允许 0，如整箱/整件缺失）。用于点货。 */
const shipmentActualQty = z
  .union([
    z.number().nonnegative(),
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/)
      .refine((value) => Number(value) >= 0, { message: '实收数量不能为负' }),
  ])
  .transform((value) => String(value));

/** 金额：number 或数字字符串，>= 0，统一转为字符串。 */
const shipmentMoney = z
  .union([
    z.number().nonnegative(),
    z.string().trim().regex(/^\d+(\.\d{1,2})?$/),
  ])
  .transform((value) => String(value));

export const shipmentTrackingSchema = z.object({
  carrier: z.string().trim().min(1).max(64),
  trackingNo: z.string().trim().min(1).max(128),
  note: z.string().trim().max(512).optional().nullable(),
});

export const shipmentItemCreateSchema = z.object({
  itemId: z.uuid(),
  expectedQty: shipmentQty,
  unitPrice: shipmentMoney.optional().nullable(),
  productionDate: dateOnly.optional().nullable(),
  expiryDate: dateOnly.optional().nullable(),
  lineNote: z.string().trim().max(1024).optional().nullable(),
});

/** 新建发货单（POST /shipments）。多物流单号 + 清单 + 箱数。 */
export const shipmentCreateSchema = z.object({
  shipperUnitId: z.uuid(),
  receiverUnitId: z.uuid(),
  boxesCount: z.number().int().nonnegative(),
  currency: currency().optional(),
  expectedArrivalDate: dateOnly.optional().nullable(),
  remark: z.string().trim().max(4096).optional().nullable(),
  trackings: z.array(shipmentTrackingSchema).min(1).max(50),
  items: z.array(shipmentItemCreateSchema).min(1).max(500),
});

/** 更新发货单（PATCH /shipments/:id）：仅 DRAFT；字段整体替换语义。 */
export const shipmentPatchSchema = shipmentCreateSchema.partial();

// ── 收货点货与差异协商─────────────────────────────────────────────────

/** 点货单行：仅提交实收数量（应收/快照只读）。 */
export const shipmentCountLineSchema = z.object({
  shipmentItemId: z.uuid(),
  actualQty: shipmentActualQty,
});

/** 保存点货草稿（POST /shipments/:id/count）：带版本号做乐观并发。 */
export const shipmentCountSchema = z.object({
  version: z.number().int().nonnegative(),
  items: z.array(shipmentCountLineSchema).min(1).max(500),
});

/** 差异修订单行（discrepancy_review_items）：逐行原因。 */
export const shipmentReviewItemSchema = z.object({
  shipmentItemId: z.uuid(),
  reason: z.string().trim().max(2000).optional().nullable(),
});

/** 提交差异修订（POST /shipments/:id/reviews）。 */
export const shipmentReviewCreateSchema = z.object({
  items: z.array(shipmentReviewItemSchema).min(1).max(500),
  reason: z.string().trim().max(4096).optional().nullable(),
  photoFileIds: z.array(z.uuid()).max(9).optional(),
});

/** 集货方拒绝差异修订（POST /reviews/:id/reject）：拒绝理由必填。 */
export const reviewRejectSchema = z.object({
  reason: z.string().trim().min(1).max(4096),
});

// ── 库存台账与手动出入库────────────────────────────────────────────

/** 手动入库单行：物品 + 数量 + 成本单价（可选）+ 批次信息（可选，缺省自动生成）。 */
export const inboundManualLineSchema = z.object({
  itemId: z.uuid(),
  qty: shipmentQty,
  unitCost: shipmentMoney.optional().nullable(),
  productionDate: dateOnly.optional().nullable(),
  expiryDate: dateOnly.optional().nullable(),
  batchNo: z.string().trim().min(1).max(64).optional().nullable(),
  lineNote: z.string().trim().max(1024).optional().nullable(),
});

/** 新建手动入库单（POST /inbound-orders）：sourceType=MANUAL。 */
export const inboundManualCreateSchema = z.object({
  warehouseUnitId: z.uuid(),
  counterpartyUnitId: z.uuid().optional().nullable(),
  remark: z.string().trim().max(4096).optional().nullable(),
  photoFileIds: z.array(z.uuid()).max(9).optional(),
  lines: z.array(inboundManualLineSchema).min(1).max(500),
});

/** 出库单行：物品 + 数量；batchId 缺省时过账按 FEFO 自动分配。 */
export const outboundLineSchema = z.object({
  itemId: z.uuid(),
  qty: shipmentQty,
  batchId: z.uuid().optional().nullable(),
});

/**
 * 新建出库单（POST /outbound-orders）：type=NORMAL 手工出库；
 * type=LOSS 报损：报损原因必填、至少 1 张附图；batchId 缺省时按 FEFO 自动分配。
 */
export const outboundCreateSchema = z
  .object({
    warehouseUnitId: z.uuid(),
    counterpartyUnitId: z.uuid().optional().nullable(),
    type: z.enum(OUTBOUND_TYPES).default('NORMAL'),
    lossReason: z.string().trim().min(1).max(2000).optional().nullable(),
    remark: z.string().trim().max(4096).optional().nullable(),
    photoFileIds: z.array(z.uuid()).max(9).optional(),
    lines: z.array(outboundLineSchema).min(1).max(500),
  })
  .superRefine((value, ctx) => {
    if (value.type !== 'LOSS') return;
    if (!value.lossReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['lossReason'],
        message: '报损单必须填写报损原因',
      });
    }
    if ((value.photoFileIds ?? []).length < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['photoFileIds'],
        message: '报损单必须至少附带 1 张图片',
      });
    }
  });

/** 设置零售价（PUT /retail-prices）：仓库 × 物品；unit_cost（入库原价）不可经此接口修改。 */
export const retailPricePutSchema = z.object({
  unitId: z.uuid(),
  itemId: z.uuid(),
  price: shipmentMoney,
  currency: currency().optional(),
});

// ── 确认入库与发货退货─────────────────────────────────────────────────

/** 确认收货（POST /shipments/:id/confirm-receipt）行级批次号（可选，缺省自动生成）。 */
export const confirmReceiptLineSchema = z.object({
  shipmentItemId: z.uuid(),
  batchNo: z.string().trim().min(1).max(64).optional().nullable(),
});

/** 确认收货：仓库对 READY 发货单确认，自动建档 DRAFT 入库单。 */
export const confirmReceiptSchema = z.object({
  remark: z.string().trim().max(4096).optional().nullable(),
  photoFileIds: z.array(z.uuid()).max(9).optional(),
  items: z.array(confirmReceiptLineSchema).max(500).optional(),
});

/** 发货退货行（POST /shipments/:id/returns）：逐行拒收数量与原因。 */
export const returnCreateItemSchema = z.object({
  shipmentItemId: z.uuid(),
  qty: shipmentQty,
  reason: z.string().trim().max(2000).optional().nullable(),
});

/** 发起发货退货（拒收）：WAREHOUSE 对 READY 发货单部分/全部拒收。 */
export const returnCreateSchema = z.object({
  items: z.array(returnCreateItemSchema).min(1).max(500),
  reason: z.string().trim().max(4096).optional().nullable(),
  note: z.string().trim().max(4096).optional().nullable(),
  photoFileIds: z.array(z.uuid()).max(9).optional(),
  returnCarrier: z.string().trim().max(64).optional().nullable(),
  returnTrackingNo: z.string().trim().max(128).optional().nullable(),
});

/** 集货方接受退货（POST /return-orders/:id/accept）：处理备注可选。 */
export const returnAcceptSchema = z.object({
  note: z.string().trim().max(4096).optional().nullable(),
});

/** 集货方拒绝退货（POST /return-orders/:id/reject）：处理备注必填。 */
export const returnRejectSchema = z.object({
  note: z.string().trim().min(1).max(4096),
});

// ── 零售售后退货────────────────────────────────────────────────────

/** 零售售后退货行（POST /sales-orders/:id/returns）：销售单行 + 退货数量 + 原因。 */
export const salesReturnCreateItemSchema = z.object({
  salesOrderItemId: z.uuid(),
  qty: shipmentQty,
  reason: z.string().trim().max(2000).optional().nullable(),
});

/** 发起零售售后退货：行级退货数量 ≤ 实收未退数量；状态 REQUESTED。 */
export const salesReturnCreateSchema = z.object({
  items: z.array(salesReturnCreateItemSchema).min(1).max(500),
  reason: z.string().trim().max(4096).optional().nullable(),
  note: z.string().trim().max(4096).optional().nullable(),
  photoFileIds: z.array(z.uuid()).max(9).optional(),
});

/** 退回收货行（POST /return-orders/:id/receive）：实收数量 ≤ 申请数量。 */
export const salesReturnReceiveLineSchema = z.object({
  returnItemId: z.uuid(),
  receivedQty: shipmentActualQty,
});

/** 退回收货：仓库录入实收数量（可部分收货）→ 回补库存 → 状态 RETURNED。 */
export const salesReturnReceiveSchema = z.object({
  items: z.array(salesReturnReceiveLineSchema).min(1).max(500),
  note: z.string().trim().max(4096).optional().nullable(),
});

// ── 销售单──────────────────────────────────────────────────────────

const discountPercent = z
  .union([
    z.number().min(0).max(100),
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/)
      .refine((value) => Number(value) <= 100, { message: '折扣必须介于 0-100 之间' }),
  ])
  .transform((value) => String(value));

/** 销售单行：物品 + 数量 + 行级改价（可选，缺省取当前零售价快照）。 */
export const salesOrderLineSchema = z.object({
  itemId: z.uuid(),
  qty: shipmentQty,
  unitPriceOverride: shipmentMoney.optional().nullable(),
});

/**
 * 新建销售单（POST /sales-orders）：卖方=仓库业务单元，买方=零售业务单元（本期固定 RETAILER_UNIT）。
 * 金额由服务端计算：行价（override 缺省零售价快照）× 数量，整单折扣后 + 运费，存快照。
 */
export const salesOrderCreateSchema = z.object({
  sellerUnitId: z.uuid(),
  buyerUnitId: z.uuid(),
  source: z.enum(SALES_SOURCES).default('RETAILER_REQUEST'),
  deliveryMethod: z.enum(DELIVERY_METHODS).default('PICKUP'),
  deliveryAddress: z.string().trim().max(1024).optional().nullable(),
  carrier: z.string().trim().max(200).optional().nullable(),
  trackingNo: z.string().trim().max(200).optional().nullable(),
  freight: shipmentMoney.optional().default('0'),
  discountPercent: discountPercent.optional().default('0'),
  currency: currency().optional(),
  remark: z.string().trim().max(4096).optional().nullable(),
  lines: z.array(salesOrderLineSchema).min(1).max(500),
});

/** 更新销售单（PATCH /sales-orders/:id）：仅 DRAFT；行整体替换，价格快照重算。 */
export const salesOrderPatchSchema = z.object({
  deliveryMethod: z.enum(DELIVERY_METHODS).optional(),
  deliveryAddress: z.string().trim().max(1024).optional().nullable(),
  carrier: z.string().trim().max(200).optional().nullable(),
  trackingNo: z.string().trim().max(200).optional().nullable(),
  freight: shipmentMoney.optional(),
  discountPercent: discountPercent.optional(),
  currency: currency().optional(),
  remark: z.string().trim().max(4096).optional().nullable(),
  lines: z.array(salesOrderLineSchema).min(1).max(500).optional(),
});

/** 手工批次分配行（发送时覆盖 FEFO）：某物品整批发指定批次。 */
export const salesSendAllocationSchema = z.object({
  itemId: z.uuid(),
  batchId: z.uuid(),
  qty: shipmentQty,
});

/** 发送销售单（POST /sales-orders/:id/send）：allocations 缺省时按 FEFO 自动分配；仓库可填写配送商与运单号（自提可留空）。 */
export const salesOrderSendSchema = z.object({
  allocations: z.array(salesSendAllocationSchema).max(500).optional(),
  carrier: z.string().trim().max(256).optional().nullable(),
  trackingNo: z.string().trim().max(128).optional().nullable(),
});

/** 上传支付凭证（POST /sales-orders/:id/payments）：凭证图片走 files 管线预上传。 */
export const salesPaymentSchema = z.object({
  amount: shipmentMoney,
  currency: currency().optional(),
  methodNote: z.string().trim().max(256).optional().nullable(),
  proofFileId: z.uuid().optional().nullable(),
});

/** 确认收货（POST /sales-orders/:id/confirm-receipt）：零售方确认后状态闭环。 */
export const salesConfirmReceiptSchema = z.object({});

/** 标记通知已读（POST /notifications/read）：批量 id 列表。 */
export const notificationReadSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
});

/**
 * 新建仓库-零售签约（POST /partnerships）：签约只由仓库侧发起。
 * WAREHOUSE 传 { retailerUnitId }（仓库=自身归属单元）；ADMIN 可传 { warehouseUnitId, retailerUnitId }。
 */
export const partnershipCreateSchema = z.object({
  warehouseUnitId: z.uuid().optional(),
  retailerUnitId: z.uuid(),
});

export type UserSelfPatchInput = z.infer<typeof userSelfPatchSchema>;
export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;
export type AdminUserPatchInput = z.infer<typeof adminUserPatchSchema>;
export type UnitCreateInput = z.infer<typeof unitCreateSchema>;
export type UnitPatchInput = z.infer<typeof unitPatchSchema>;
export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemPatchInput = z.infer<typeof itemPatchSchema>;
export type ItemAttachImagesInput = z.infer<typeof itemAttachImagesSchema>;
export type ShipmentCreateInput = z.infer<typeof shipmentCreateSchema>;
export type ShipmentPatchInput = z.infer<typeof shipmentPatchSchema>;
export type ShipmentTrackingInput = z.infer<typeof shipmentTrackingSchema>;
export type ShipmentItemCreateInput = z.infer<typeof shipmentItemCreateSchema>;
export type ShipmentCountLineInput = z.infer<typeof shipmentCountLineSchema>;
export type ShipmentCountInput = z.infer<typeof shipmentCountSchema>;
export type ShipmentReviewItemInput = z.infer<typeof shipmentReviewItemSchema>;
export type ShipmentReviewCreateInput = z.infer<typeof shipmentReviewCreateSchema>;
export type ReviewRejectInput = z.infer<typeof reviewRejectSchema>;
export type ConfirmReceiptLineInput = z.infer<typeof confirmReceiptLineSchema>;
export type ConfirmReceiptInput = z.infer<typeof confirmReceiptSchema>;
export type ReturnCreateItemInput = z.infer<typeof returnCreateItemSchema>;
export type ReturnCreateInput = z.infer<typeof returnCreateSchema>;
export type ReturnAcceptInput = z.infer<typeof returnAcceptSchema>;
export type ReturnRejectInput = z.infer<typeof returnRejectSchema>;
export type SalesReturnCreateItemInput = z.infer<typeof salesReturnCreateItemSchema>;
export type SalesReturnCreateInput = z.infer<typeof salesReturnCreateSchema>;
export type SalesReturnReceiveLineInput = z.infer<typeof salesReturnReceiveLineSchema>;
export type SalesReturnReceiveInput = z.infer<typeof salesReturnReceiveSchema>;
export type InboundManualLineInput = z.infer<typeof inboundManualLineSchema>;
export type InboundManualCreateInput = z.infer<typeof inboundManualCreateSchema>;
export type OutboundLineInput = z.infer<typeof outboundLineSchema>;
export type OutboundCreateInput = z.infer<typeof outboundCreateSchema>;
export type RetailPricePutInput = z.infer<typeof retailPricePutSchema>;
export type SalesOrderLineInput = z.infer<typeof salesOrderLineSchema>;
export type SalesOrderCreateInput = z.infer<typeof salesOrderCreateSchema>;
export type SalesOrderPatchInput = z.infer<typeof salesOrderPatchSchema>;
export type SalesSendAllocationInput = z.infer<typeof salesSendAllocationSchema>;
export type SalesOrderSendInput = z.infer<typeof salesOrderSendSchema>;
export type SalesPaymentInput = z.infer<typeof salesPaymentSchema>;
export type SalesConfirmReceiptInput = z.infer<typeof salesConfirmReceiptSchema>;
export type NotificationReadInput = z.infer<typeof notificationReadSchema>;
export type PartnershipCreateInput = z.infer<typeof partnershipCreateSchema>;
