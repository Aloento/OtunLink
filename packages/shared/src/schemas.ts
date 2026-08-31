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

export type UserSelfPatchInput = z.infer<typeof userSelfPatchSchema>;
export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;
export type AdminUserPatchInput = z.infer<typeof adminUserPatchSchema>;
export type UnitCreateInput = z.infer<typeof unitCreateSchema>;
export type UnitPatchInput = z.infer<typeof unitPatchSchema>;
export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemPatchInput = z.infer<typeof itemPatchSchema>;
export type ItemAttachImagesInput = z.infer<typeof itemAttachImagesSchema>;
