import { z } from 'zod';

import { UNIT_TYPES, USER_ROLES, USER_STATUSES } from './auth';

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

export type UserSelfPatchInput = z.infer<typeof userSelfPatchSchema>;
export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;
export type AdminUserPatchInput = z.infer<typeof adminUserPatchSchema>;
export type UnitCreateInput = z.infer<typeof unitCreateSchema>;
export type UnitPatchInput = z.infer<typeof unitPatchSchema>;
