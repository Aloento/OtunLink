import { Button, Spinner, type ButtonProps } from '@fluentui/react-components';
import { useIsFetching, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RefreshButtonProps {
  /** 需要重新拉取的查询键（前缀匹配，例如 ['items'] 会触发 ['items','picker','x']）。 */
  queryKey: QueryKey;
  /** 附加的查询键，随 queryKey 一起刷新。 */
  additionalKeys?: QueryKey[];
  size?: ButtonProps['size'];
}

function matchesPrefix(filter: QueryKey, key: QueryKey): boolean {
  return filter.length <= key.length && filter.every((part, i) => part === key[i]);
}

/** 手动刷新按钮：失效并重拉指定查询，刷新期间禁用（防连点、防重复发起）。 */
export function RefreshButton({ queryKey, additionalKeys, size = 'small' }: RefreshButtonProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const busyRef = useRef(false);

  const keys = additionalKeys ? [queryKey, ...additionalKeys] : [queryKey];

  const fetchingCount = useIsFetching({
    predicate: (query) => keys.some((key) => matchesPrefix(key, query.queryKey)),
  });

  const busy = refreshing || fetchingCount > 0;

  const handleRefresh = () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRefreshing(true);
    void Promise.all(
      keys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
    ).finally(() => {
      busyRef.current = false;
      setRefreshing(false);
    });
  };

  return (
    <Button
      size={size}
      appearance="secondary"
      icon={busy ? <Spinner size="tiny" /> : <span aria-hidden>{'\u27F3'}</span>}
      onClick={handleRefresh}
      disabled={busy}
      title={t('common.refresh')}
      aria-label={t('common.refresh')}
    />
  );
}
