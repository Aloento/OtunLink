import { Command } from 'cmdk';
import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../lib/cn';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { Kbd } from './kbd';

// 命令面板（⌘K）：ERP 里页面和记录都多，键盘直达比逐级点菜单快一个数量级。
// 面板本身用原生 <dialog> 承载：cmdk 的上层封装会引入 Radix Dialog，
// 那套自建 aria-modal + 焦点陷阱与 dialog 指南冲突。

export interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  /** 额外的匹配词：拼音、单号、编码都可以放这里。 */
  keywords?: string;
  run: () => void;
}

export interface CommandGroup {
  heading: string;
  actions: CommandAction[];
}

export function CommandPalette({
  open,
  onOpenChange,
  groups,
  onQueryRecords,
  recordsHeading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandGroup[];
  /** 输入时的异步记录搜索（物品、单据）；不传则只搜静态命令。 */
  onQueryRecords?: (query: string) => Promise<CommandAction[]>;
  recordsHeading?: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<CommandAction[]>([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebouncedValue(query, 220);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setRecords([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !onQueryRecords || debounced.trim().length < 2) {
      setRecords([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    onQueryRecords(debounced.trim())
      .then((result) => {
        if (!cancelled) setRecords(result);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open, onQueryRecords]);

  const run = (action: CommandAction) => {
    onOpenChange(false);
    // 让 dialog 的关闭动画与焦点归还先发生，再执行跳转/动作
    requestAnimationFrame(() => action.run());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} closeLabel={t('common.close')}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t('common.commandPalette')}</DialogTitle>
        <Command shouldFilter className="flex min-h-0 flex-col" loop>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search aria-hidden className="size-4 shrink-0 text-ink-subtle" />
            <Command.Input
              data-autofocus
              value={query}
              onValueChange={setQuery}
              placeholder={t('common.globalSearch')}
              className="h-10 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-subtle"
            />
            <Kbd>Esc</Kbd>
          </div>

          <Command.List className="app-scroll max-h-80 overflow-auto p-1">
            <Command.Empty className="px-3 py-8 text-center text-xs text-ink-muted">
              {loading ? t('common.loading') : t('common.noResults')}
            </Command.Empty>

            {records.length > 0 ? (
              <Command.Group
                heading={recordsHeading ?? t('common.search')}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-subtle"
              >
                {records.map((action) => (
                  <CommandRow key={action.id} action={action} onRun={run} />
                ))}
              </Command.Group>
            ) : null}

            {groups.map((group) => (
              <Command.Group
                key={group.heading}
                heading={group.heading}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-subtle"
              >
                {group.actions.map((action) => (
                  <CommandRow key={action.id} action={action} onRun={run} />
                ))}
              </Command.Group>
            ))}
          </Command.List>

          <div className="flex items-center gap-3 border-t border-line px-3 py-1.5 text-[11px] text-ink-subtle">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              {t('common.picker.hint').split('·')[0]}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>
                <CornerDownLeft aria-hidden className="size-3" />
              </Kbd>
              Enter
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandRow({ action, onRun }: { action: CommandAction; onRun: (action: CommandAction) => void }) {
  return (
    <Command.Item
      value={`${action.label} ${action.keywords ?? ''}`}
      onSelect={() => onRun(action)}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-[13px] text-ink-soft',
        'data-[selected=true]:bg-brand-50 data-[selected=true]:text-ink',
      )}
    >
      {action.icon ? <span className="text-ink-subtle [&_svg]:size-4">{action.icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{action.label}</span>
      {action.hint ? <span className="shrink-0 truncate text-[11px] text-ink-subtle">{action.hint}</span> : null}
    </Command.Item>
  );
}
