import type { FileRecord, ItemImageRecord, ItemRecord, UnitRecord, UserRecord } from '../types';

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

export function itemDto(item: ItemRecord) {
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    barcode: item.barcode,
    specUnit: item.specUnit,
    innerUnit: item.innerUnit,
    innerCount: item.innerCount,
    isPerishable: item.isPerishable,
    category: item.category,
    description: item.description,
    status: item.status,
    createdBy: item.createdBy,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function fileDto(file: FileRecord) {
  return {
    id: file.id,
    key: file.key,
    thumbnailKey: file.thumbnailKey,
    mime: file.mime,
    size: file.size,
    width: file.width,
    height: file.height,
    hasThumbnail: file.thumbnailKey !== null,
    createdAt: file.createdAt.toISOString(),
  };
}

export function itemImageDto(image: ItemImageRecord) {
  return {
    id: image.id,
    itemId: image.itemId,
    fileId: image.fileId,
    isPrimary: image.isPrimary,
    sortOrder: image.sortOrder,
    createdAt: image.createdAt.toISOString(),
    ...(image.file ? { file: fileDto(image.file) } : {}),
  };
}
