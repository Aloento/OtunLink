// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initI18n } from '../i18n';
import type { RouteKey } from '../routes/routes';
import { MobileNav } from './MobileNav';

// 手机导航的回归测试：这里的失败模式是「功能入口根本点不到」，
// 所以断的是「全部路由都出现在某个可见位置」，不是样式。

beforeAll(() => {
  initI18n();
  // jsdom 没有实现 <dialog> 的模态方法，补最小实现让受控开关可测。
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

afterEach(cleanup);

const MAIN: RouteKey[] = ['dashboard', 'shipments', 'items', 'inbound', 'outbound', 'sales'];
const ADMIN: RouteKey[] = ['adminUsers', 'adminUnits'];

function renderNav(main: RouteKey[], admin: RouteKey[] = []) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <MobileNav main={main} admin={admin} />
    </MemoryRouter>,
  );
}

describe('MobileNav', () => {
  it('底部只放 4 个主入口 + 更多，不依赖横向滚动', () => {
    const { container } = renderNav(MAIN, ADMIN);
    const bar = screen.getByRole('navigation', { name: /主导航/ });
    const links = within(bar).getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(within(bar).getByRole('button', { name: /更多/ })).toBeTruthy();
    // 底部条本身不应出现横向滚动（旧实现靠 overflow-x-auto 藏起后 8 个入口）
    expect(container.querySelector('nav')?.className).not.toContain('overflow-x-auto');
  });

  it('「更多」里列全所有路由，包含放不进底栏的与管理端入口', () => {
    renderNav(MAIN, ADMIN);
    fireEvent.click(screen.getByRole('button', { name: /更多/ }));

    const dialog = screen.getByRole('dialog');
    // 中文文案来自 nav.<key>：逐个点名，确保不是「只渲染了前几个」
    for (const label of ['工作台', '发货单', '物品目录', '入库单', '出库单', '销售单', '用户管理', '业务单元']) {
      expect(within(dialog).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(within(dialog).getAllByRole('link')).toHaveLength(MAIN.length + ADMIN.length);
  });

  it('没有溢出时不渲染「更多」', () => {
    renderNav(['dashboard', 'items'] as RouteKey[]);
    expect(screen.queryByRole('button', { name: /更多/ })).toBeNull();
    // 弹窗里的链接始终在 DOM 中（关闭状态只是没有 open 属性），所以按底栏范围数
    const bar = screen.getByRole('navigation', { name: /主导航/ });
    expect(within(bar).getAllByRole('link')).toHaveLength(2);
  });
});
