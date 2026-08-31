import type { UnitRecord, UserRecord } from '../types';

// 对外 DTO：剥离内部/敏感字段（entraSub 属于租户身份标识，不下发到前端）。

export function publicUserDto(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    scopeUnitId: user.scopeUnitId,
    status: user.status,
    locale: user.locale,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function adminUserDto(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    scopeUnitId: user.scopeUnitId,
    status: user.status,
    locale: user.locale,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function unitDto(unit: UnitRecord) {
  return {
    id: unit.id,
    code: unit.code,
    name: unit.name,
    type: unit.type,
    address: unit.address,
    contact: unit.contact,
    timezone: unit.timezone,
    baseCurrency: unit.baseCurrency,
    isActive: unit.isActive,
    createdAt: unit.createdAt.toISOString(),
    updatedAt: unit.updatedAt.toISOString(),
  };
}
