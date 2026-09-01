import type { Paged, UnitType, UserRole, UserStatus } from '@otunlink/shared';

import { apiDelete, apiGet, apiPatch, apiPost } from './http';

// 管理端 API 客户端：用户 / 业务单元 / 审计日志 / 邮件连通性。
// 所有端点均在服务端以 requirePermission / requireRole('ADMIN') 保护。

export interface AdminUserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  scopeUnitId: string | null;
  status: UserStatus;
  locale: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAdminUserInput {
  entraSub: string;
  email: string;
  name: string;
  role?: UserRole;
  scopeUnitId?: string | null;
  status?: UserStatus;
  locale?: string;
}

export interface PatchAdminUserInput {
  name?: string;
  role?: UserRole;
  scopeUnitId?: string | null;
  status?: UserStatus;
  locale?: string;
}

export interface CreateUnitInput {
  code: string;
  name: string;
  type: UnitType;
  address?: string;
  contact?: string;
  timezone?: string;
  baseCurrency?: string;
  isActive?: boolean;
}

export interface PatchUnitInput {
  code?: string;
  name?: string;
  type?: UnitType;
  address?: string | null;
  contact?: string | null;
  timezone?: string;
  baseCurrency?: string;
  isActive?: boolean;
}

export interface AuditLogDto {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

export interface AuditLogListQuery {
  page?: number;
  size?: number;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  from?: string;
  to?: string;
}

export interface EmailTestResult {
  ok: boolean;
  provider: string;
  reason: string | null;
}

function toQuery(params: AuditLogListQuery): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.size !== undefined) search.set('size', String(params.size));
  if (params.entityType) search.set('entityType', params.entityType);
  if (params.entityId) search.set('entityId', params.entityId);
  if (params.actorId) search.set('actorId', params.actorId);
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function listAdminUsers(): Promise<AdminUserDto[]> {
  return apiGet<AdminUserDto[]>('/api/v1/admin/users');
}

export function createAdminUser(input: CreateAdminUserInput): Promise<AdminUserDto> {
  return apiPost<AdminUserDto>('/api/v1/admin/users', input);
}

export function updateAdminUser(id: string, input: PatchAdminUserInput): Promise<AdminUserDto> {
  return apiPatch<AdminUserDto>(`/api/v1/admin/users/${encodeURIComponent(id)}`, input);
}

export function deleteAdminUser(id: string): Promise<{ id: string }> {
  return apiDelete<{ id: string }>(`/api/v1/admin/users/${encodeURIComponent(id)}`);
}

export function listAdminUnits(): Promise<import('./units').UnitDto[]> {
  return apiGet<import('./units').UnitDto[]>('/api/v1/admin/units');
}

export function createAdminUnit(input: CreateUnitInput): Promise<import('./units').UnitDto> {
  return apiPost<import('./units').UnitDto>('/api/v1/admin/units', input);
}

export function updateAdminUnit(
  id: string,
  input: PatchUnitInput,
): Promise<import('./units').UnitDto> {
  return apiPatch<import('./units').UnitDto>(`/api/v1/admin/units/${encodeURIComponent(id)}`, input);
}

export function listAuditLogs(params: AuditLogListQuery = {}): Promise<Paged<AuditLogDto>> {
  return apiGet<Paged<AuditLogDto>>(`/api/v1/admin/audit-logs${toQuery(params)}`);
}

export function testEmail(): Promise<EmailTestResult> {
  return apiPost<EmailTestResult>('/api/v1/admin/test-email');
}
