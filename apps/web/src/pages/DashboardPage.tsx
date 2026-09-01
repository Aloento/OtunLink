import { Body1, Spinner, Text, Title1 } from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { DashboardTodoItem } from '@otunlink/shared';

import { getDashboardTodos } from '../api/notifications';

// 工作台：按角色 + scope 聚合待办（GET /dashboard/todos）。
// 后端已按岗位计算（集货/仓库/零售/管理员），前端只负责展示与状态处理。
export function DashboardPage() {
  const { t } = useTranslation();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'todos'],
    queryFn: getDashboardTodos,
    staleTime: 30_000,
  });

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Title1 as="h1">{t('dashboard.title')}</Title1>
        <Body1>{t('dashboard.description')}</Body1>
      </div>

      {isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : isError ? (
        <Text className="text-red-600">{t('errors.UNKNOWN')}</Text>
      ) : items.length === 0 ? (
        <Text className="text-neutral-500">{t('dashboard.empty')}</Text>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((todo) => (
            <TodoCard key={todo.key} todo={todo} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TodoCard({ todo }: { todo: DashboardTodoItem }) {
  return (
    <li className="rounded-lg border border-neutral-200 bg-white p-4">
      <Link to={todo.link} className="flex flex-col gap-2 hover:underline">
        <span className="text-sm text-neutral-600">{todo.label}</span>
        <span className="text-2xl font-semibold text-neutral-900">{todo.count}</span>
      </Link>
    </li>
  );
}
