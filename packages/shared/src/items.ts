// 物品目录相关的类型与常量（design.md §4.2）。
// 与 packages/db 的 spec_unit/item_status 枚举保持语义一致；shared 只放前端/后端共用的
// 类型与判定逻辑，数据库层枚举在 packages/db/src/enums.ts 独立维护。

export const SPEC_UNITS = ['PIECE', 'BAG', 'BOX', 'PACK', 'SET', 'OTHER'] as const;
export type SpecUnit = (typeof SPEC_UNITS)[number];

export const ITEM_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** 物品公开 DTO（GET /items 系列返回；与 admin DTO 一致，不含内部字段）。 */
export interface ItemDto {
  id: string;
  sku: string | null;
  name: string;
  barcode: string | null;
  specUnit: SpecUnit;
  innerUnit: SpecUnit | null;
  innerCount: string | null;
  isPerishable: boolean;
  category: string | null;
  description: string | null;
  status: ItemStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 物品图片 DTO（item_images + files 联合返回）。 */
export interface ItemImageDto {
  id: string;
  itemId: string;
  fileId: string;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
  file?: FileDto;
}

/** 文件 DTO（POST /files 返回；签名 URL 经 GET /files/:id/url 获取）。 */
export interface FileDto {
  id: string;
  key: string;
  thumbnailKey: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  hasThumbnail: boolean;
  createdAt: string;
}

/** 列表分页包装（items 等列表共用）。 */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
