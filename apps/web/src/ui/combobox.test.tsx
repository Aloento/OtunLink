// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Combobox, type ComboboxOption } from './combobox';

// Combobox 的键盘与 IME 行为是自写的，最容易被后续改动弄坏，单独锁住。

afterEach(() => cleanup());

const options: ComboboxOption[] = [
  { value: 'a', label: '苹果' },
  { value: 'b', label: '香蕉' },
];

function Host({ onSelect }: { onSelect: (option: ComboboxOption) => void }) {
  const [value, setValue] = useState('');
  return (
    <Combobox
      value={value}
      onValueChange={setValue}
      options={options}
      onSelect={onSelect}
      aria-label="物品"
    />
  );
}

function keyDown(el: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
}

describe('Combobox', () => {
  it('输入触发 onValueChange，且暴露 combobox 语义', () => {
    const onSelect = vi.fn();
    render(<Host onSelect={onSelect} />);

    const input = screen.getByRole('combobox', { name: '物品' });
    expect(input.getAttribute('aria-expanded')).toBe('false');

    fireEvent.change(input, { target: { value: '苹' } });
    expect((input as HTMLInputElement).value).toBe('苹');
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('方向键 + Enter 选中当前项', () => {
    const onSelect = vi.fn();
    render(<Host onSelect={onSelect} />);
    const input = screen.getByRole('combobox', { name: '物品' });

    // 分两次派发，让 React 在离散事件之间刷新状态（真实键盘也是这样）。
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(options[0]);
  });

  it('IME 组字期间的回车不选中（中文输入法确认候选词）', () => {
    const onSelect = vi.fn();
    render(<Host onSelect={onSelect} />);
    const input = screen.getByRole('combobox', { name: '物品' });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const composing = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      // jsdom 支持 isComposing 初始化；这是指南要求的原生判断
      isComposing: true,
    });
    input.dispatchEvent(composing);

    expect(onSelect).not.toHaveBeenCalled();
    expect(composing.defaultPrevented).toBe(false);
  });

  it('Safari 乱序：isComposing 已复位但 keyCode 为 229 时同样不选中', () => {
    const onSelect = vi.fn();
    render(<Host onSelect={onSelect} />);
    const input = screen.getByRole('combobox', { name: '物品' });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const safari = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(safari, 'keyCode', { value: 229 });
    input.dispatchEvent(safari);

    expect(onSelect).not.toHaveBeenCalled();
  });
});
