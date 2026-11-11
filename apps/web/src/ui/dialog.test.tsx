// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { initI18n } from '../i18n';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './dialog';
import { Field } from './field';
import { Pagination } from './pagination';

// 这些测试盯的是「迁移后行为是否还成立」，不是像素：
// 原生 <dialog> 的开关、初始焦点、Field 的 label/aria 接线、分页的可访问名称。

beforeAll(() => {
  initI18n();
  // jsdom 没有实现 <dialog> 的模态方法，补一个最小实现（只为让受控逻辑可测）。
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  if (typeof proto.showModal !== 'function') {
    Object.defineProperty(HTMLDialogElement.prototype, 'open', {
      configurable: true,
      get(this: HTMLDialogElement) {
        return this.hasAttribute('open');
      },
      set(this: HTMLDialogElement, value: boolean) {
        if (value) this.setAttribute('open', '');
        else this.removeAttribute('open');
      },
    });
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});

// 没有启用 vitest globals 时 RTL 不会自动卸载，必须手动 cleanup，否则 DOM 串场。
afterEach(() => cleanup());

function Host({ onOpenChange }: { onOpenChange?: (next: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}
      closeLabel="关闭"
    >
      <button type="button" onClick={() => setOpen(true)}>
        打开
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>标题</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <input aria-label="第一个字段" />
        </DialogBody>
        <DialogFooter>
          <button type="button">确定</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe('Dialog（原生 <dialog> 实现）', () => {
  it('打开时调用 showModal，关闭时调用 close 并回写受控状态', () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const close = vi.spyOn(HTMLDialogElement.prototype, 'close');
    const onOpenChange = vi.fn();

    render(<Host onOpenChange={onOpenChange} />);
    const dialog = document.querySelector('dialog')!;
    expect(dialog.open).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '打开' }));
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(true);

    // 原生关闭（Esc / 返回手势 / 关闭按钮）会派发 close 事件 → 受控状态回写
    act(() => dialog.close());
    expect(close).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    showModal.mockRestore();
    close.mockRestore();
  });

  it('关闭按钮带 data-dialog-dismiss，不会成为初始焦点候选', () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: '打开' }));

    const dialog = document.querySelector('dialog')!;
    const heading = dialog.querySelector('h2')!;
    expect(heading.textContent).toBe('标题');
    expect(dialog.querySelector('[data-dialog-dismiss]')).not.toBeNull();
    expect(dialog.querySelectorAll('[data-autofocus]')).toHaveLength(0);
    showModal.mockRestore();
  });

  it('不设置 role="dialog" / aria-modal（原生模态已提供）', () => {
    render(<Host />);
    const dialog = document.querySelector('dialog')!;
    expect(dialog.getAttribute('role')).toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBeNull();
  });

  it('卸载时关闭仍打开的模态，避免页面停留在 inert 状态', () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const close = vi.spyOn(HTMLDialogElement.prototype, 'close');
    const { unmount } = render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: '打开' }));
    const dialog = document.querySelector('dialog')!;
    expect(dialog.open).toBe(true);

    unmount();
    expect(close).toHaveBeenCalled();
    showModal.mockRestore();
    close.mockRestore();
  });
});

describe('Field', () => {
  it('把 label 的 for 指到控件 id，并关联 hint 与错误', () => {
    render(
      <Field label="物品名称" hint="必填" error="不能为空">
        <input />
      </Field>,
    );

    const input = screen.getByRole('textbox');
    const label = screen.getByText('物品名称');
    expect(label.getAttribute('for')).toBe(input.id);
    expect(input.getAttribute('aria-invalid')).toBe('true');

    const hint = document.getElementById(`${input.id}-hint`)!;
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('不能为空');
    expect(alert.id).toBe(`${input.id}-error`);
    expect(input.getAttribute('aria-describedby')).toBe(`${hint.id} ${alert.id}`);
  });

  it('unlabeled 时用分组语义，不生成孤儿 label', () => {
    render(
      <Field label="图片" unlabeled>
        <div data-testid="upload" />
      </Field>,
    );

    expect(document.querySelector('label')).toBeNull();
    expect(screen.getByRole('group', { name: '图片' })).not.toBeNull();
  });
});

describe('Pagination', () => {
  it('箭头按钮有可访问名称，且按边界禁用', () => {
    const onChange = vi.fn();
    render(<Pagination page={1} totalPages={3} onChange={onChange} totalLabel="共 30 条" />);

    const prev = screen.getByRole('button', { name: '上一页' });
    const next = screen.getByRole('button', { name: '下一页' });
    expect((prev as HTMLButtonElement).disabled).toBe(true);
    expect((next as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(next);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('只有一页时只显示总数', () => {
    render(<Pagination page={1} totalPages={1} onChange={() => {}} totalLabel="共 3 条" />);
    expect(screen.queryByRole('button', { name: '下一页' })).toBeNull();
    expect(screen.getByText('共 3 条')).not.toBeNull();
  });
});
