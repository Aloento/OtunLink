import type { DashboardTodoItem, NotificationDto, NotificationListQuery, Paged } from '@otunlink/shared';

import { apiGet, apiPost } from './http';

// 通知中心 / 工作台待办 API 客户端。

function toQuery(params: NotificationListQuery): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.size !== undefined) search.set('size', String(params.size));
  if (params.unreadOnly) search.set('unreadOnly', 'true');
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** 通知列表（本人 + 所属 scope）。 */
export function listNotifications(params: NotificationListQuery = {}): Promise<Paged<NotificationDto>> {
  return apiGet<Paged<NotificationDto>>(`/api/v1/notifications${toQuery(params)}`);
}

/** 未读通知数（导航小红点）。 */
export function getUnreadCount(): Promise<{ count: number }> {
  return apiGet<{ count: number }>('/api/v1/notifications/unread-count');
}

/** 批量标记已读；返回 updated 数量与剩余未读数。 */
export function markNotificationsRead(ids: string[]): Promise<{ updated: number; unread: number }> {
  return apiPost<{ updated: number; unread: number }>('/api/v1/notifications/read', { ids });
}

/** 工作台待办聚合（按角色 + scope）。 */
export function getDashboardTodos(): Promise<{ items: DashboardTodoItem[] }> {
  return apiGet<{ items: DashboardTodoItem[] }>('/api/v1/dashboard/todos');
}
