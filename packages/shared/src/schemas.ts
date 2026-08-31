import { z } from 'zod';

import { UNIT_TYPES, USER_ROLES, USER_STATUSES } from './auth';
import { ITEM_STATUSES, SPEC_UNITS } from './items';

// 认证/岗位/业务单元相关的请求校验（ck-02 范围）。
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
const itemStatus = () => z.enum(ITEM_STATUSES);

const innerCountSchema = z
  .union([
    z.number().nonnegative(),
    z.string().trim().regex(/^\d+(\.\d+)?$/),
  ])
  .transform((value) => String(value));

/** 新建物品（POST /items）。条码可空；spec_unit 默认 PIECE。 */
export const itemCreateSchema = z.object({
  sku: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1).max(256),
  barcode: z.string().trim().max(128).optional(),
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
  barcode: z.string().trim().max(128).optional().nullable(),
  specUnit: specUnit().optional(),
  innerUnit: specUnit().optional().nullable(),
  innerCount: innerCountSchema.optional().nullable(),
  isPerishable: z.boolean().optional(),
  category: z.string().trim().max(128).optional().nullable(),
  description: z.string().trim().max(4096).optional().nullable(),
  status: itemStatus().optional(),
});

// ── 发货单（ck-05）────────────────────────────────────────────────────────

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
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).optional(),
  expectedArrivalDate: dateOnly.optional().nullable(),
  remark: z.string().trim().max(4096).optional().nullable(),
  trackings: z.array(shipmentTrackingSchema).min(1).max(50),
  items: z.array(shipmentItemCreateSchema).min(1).max(500),
});

/** 更新发货单（PATCH /shipments/:id）：仅 DRAFT；字段整体替换语义。 */
export const shipmentPatchSchema = shipmentCreateSchema.partial();

// ── 收货点货与差异协商（ck-06）─────────────────────────────────────────────────

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

// ── 确认入库与发货退货（ck-07）─────────────────────────────────────────────────

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
