import { apiDelete, apiGet, apiPost } from './http';
import type { UnitDto } from './units';

// 仓库-零售签约 API 客户端：
// 签约只由仓库侧发起（把零售加入「可售客户」），零售无需同意、无状态字段。
// 数据范围由服务端按岗位决定：WAREHOUSE=自己仓库客户、RETAILER=已签约仓库、ADMIN=全量。

export interface PartnershipDto {
  id: string;
  warehouseUnitId: string;
  warehouseUnitName: string | null;
  retailerUnitId: string;
  retailerUnitName: string | null;
  createdBy: string | null;
  createdAt: string;
}

export function listPartnerships(): Promise<{ items: PartnershipDto[] }> {
  return apiGet<{ items: PartnershipDto[] }>('/api/v1/partnerships');
}

/** 可添加为客户的零售单元目录（WAREHOUSE/ADMIN 专用）。 */
export function listPartnerCandidates(): Promise<{ items: UnitDto[] }> {
  return apiGet<{ items: UnitDto[] }>('/api/v1/partnerships/candidates');
}

export function createPartnership(input: {
  retailerUnitId: string;
  warehouseUnitId?: string;
}): Promise<PartnershipDto> {
  return apiPost<PartnershipDto>('/api/v1/partnerships', input);
}

export function deletePartnership(id: string): Promise<{ id: string }> {
  return apiDelete<{ id: string }>(`/api/v1/partnerships/${encodeURIComponent(id)}`);
}
