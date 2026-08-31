// 通知 / 工作台待办相关类型（design.md §8.5）。
// 前后端共用；数据库层字段见 packages/db/src/schema.ts（notifications 表）。

/** 站内通知 DTO（GET /notifications 返回；time 均为 ISO 字符串）。 */
export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  content: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/** 通知列表筛选（GET /notifications）。 */
export interface NotificationListQuery {
  page?: number;
  size?: number;
  /** 仅未读。 */
  unreadOnly?: boolean;
}

/** 工作台待办条目（GET /dashboard/todos）。 */
export interface DashboardTodoItem {
  /** 稳定标识，如 shipments-to-count（前端可映射 i18n）。 */
  key: string;
  /** 中文标签（后端聚合时生成，前端可直接展示）。 */
  label: string;
  count: number;
  /** 前端路由跳转链接。 */
  link: string;
}
