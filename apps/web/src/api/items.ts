import type { FileDto, ItemDto, ItemImageDto, Paged, SpecUnit, ItemStatus } from '@otunlink/shared';

import { apiGet, apiPatch, apiPost, apiRequest } from './http';

// 物品目录 API 客户端：/items 与 /files。

export interface ItemDetail extends ItemDto {
  images: ItemImageDto[];
}

export interface ItemListQuery {
  q?: string;
  page?: number;
  size?: number;
  category?: string;
}

export interface CreateItemInput {
  sku?: string;
  name: string;
  barcode?: string;
  specUnit?: SpecUnit;
  innerUnit?: SpecUnit;
  innerCount?: number | string;
  isPerishable?: boolean;
  category?: string;
  description?: string;
  status?: ItemStatus;
  fileIds?: string[];
}

export interface UpdateItemInput {
  sku?: string | null;
  name?: string;
  barcode?: string | null;
  specUnit?: SpecUnit;
  innerUnit?: SpecUnit | null;
  innerCount?: number | string | null;
  isPerishable?: boolean;
  category?: string | null;
  description?: string | null;
  status?: ItemStatus;
}

export interface PresignedFileUrl {
  url: string;
  thumbnailUrl?: string;
  expiresInSeconds: number;
}

function toQuery(params: ItemListQuery): string {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.size !== undefined) search.set('size', String(params.size));
  if (params.category) search.set('category', params.category);
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function listItems(params: ItemListQuery = {}): Promise<Paged<ItemDto>> {
  return apiGet<Paged<ItemDto>>(`/api/v1/items${toQuery(params)}`);
}

export function getItem(id: string): Promise<ItemDetail> {
  return apiGet<ItemDetail>(`/api/v1/items/${id}`);
}

export function getItemByBarcode(code: string): Promise<ItemDto> {
  return apiGet<ItemDto>(`/api/v1/items/by-barcode?code=${encodeURIComponent(code)}`);
}

export async function listItemCategories(): Promise<string[]> {
  const data = await apiGet<{ categories: string[] }>('/api/v1/items/categories');
  return data.categories;
}

export function createItem(input: CreateItemInput): Promise<ItemDetail> {
  return apiPost<ItemDetail>('/api/v1/items', input);
}

export function updateItem(id: string, input: UpdateItemInput): Promise<ItemDto> {
  return apiPatch<ItemDto>(`/api/v1/items/${id}`, input);
}

export function attachItemImages(id: string, fileIds: string[]): Promise<ItemImageDto[]> {
  return apiPost<ItemImageDto[]>(`/api/v1/items/${id}/images`, { fileIds });
}

/** multipart 上传压缩后的展示图 + 可选缩略图，返回文件 DTO。 */
export function uploadItemImage(input: { image: Blob; thumb?: Blob }): Promise<FileDto> {
  const form = new FormData();
  form.set('image', input.image, 'image.jpg');
  if (input.thumb) form.set('thumb', input.thumb, 'thumb.jpg');
  return apiRequest<FileDto>('/api/v1/files', {
    method: 'POST',
    body: form,
  });
}

export function getFileUrl(id: string): Promise<PresignedFileUrl> {
  return apiGet<PresignedFileUrl>(`/api/v1/files/${id}/url`);
}
