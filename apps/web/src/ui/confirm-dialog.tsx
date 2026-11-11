import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, type ButtonVariant } from './button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './dialog';

/**
 * 二次确认弹窗，替代 `window.confirm`。
 *
 * 破坏性操作（`tone="danger"`）把初始焦点放在「取消」上：误触 Enter 不会顺手删掉数据，
 * 而且焦点不会因为按钮位置变化而落到危险按钮上（见 modern-web-guidance: dialog）。
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ButtonVariant;
  busy?: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const destructive = tone === 'danger';

  return (
    <Dialog open={open} onOpenChange={onOpenChange} closeLabel={t('common.close')}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description ? <DialogBody>{description}</DialogBody> : null}
        <DialogFooter>
          <Button
            variant="secondary"
            data-autofocus={destructive ? true : undefined}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={tone}
            data-autofocus={destructive ? undefined : true}
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
