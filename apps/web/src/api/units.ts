import type { UnitType } from '@otunlink/shared';

import { apiGet } from './http';

// 业务单元 API 客户端（ck-05）：GET /units（登录用户可见单元，受 scope 约束）。

export interface UnitDto {
  id: string;
  code: string;
  name: string;
  type: UnitType;
  address: string | null;
  contact: string | null;
  timezone: string;
  baseCurrency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function listUnits(): Promise<UnitDto[]> {
  return apiGet<UnitDto[]>('/api/v1/units');
}
