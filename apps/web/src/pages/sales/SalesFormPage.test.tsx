// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { initI18n } from '../../i18n';
import { TooltipProvider } from '../../ui/tooltip';
import { SalesFormPage } from './SalesFormPage';

// 销售单开单页的冒烟测试：这个页面在「物品选择从 <Select> 换成 EntityPicker」时
// 改过数据流（行上的名称/单位按 itemId 缓存），崩了就是开不了单 —— 比样式重要得多。
// 这里只验证「能渲染出关键控件」，不验证提交（提交依赖真实 API 契约）。

vi.mock('../../auth/SessionProvider', () => ({
  useSession: () => ({ me: { id: 'u1', name: '测试', role: 'ADMIN', scopeUnitId: null } }),
}));
vi.mock('../../api/units', () => ({ listUnits: async () => [] }));
vi.mock('../../api/partnerships', () => ({ listPartnerships: async () => ({ items: [], total: 0 }) }));
vi.mock('../../api/items', () => ({
  listItems: async () => ({
    items: [
      {
        id: 'item-1',
        name: '苹果',
        sku: 'APL',
        barcode: null,
        specUnit: 'BOX',
        innerUnit: null,
        minSaleUnit: 'SPEC',
        status: 'ACTIVE',
      },
    ],
    total: 1,
  }),
}));
vi.mock('../../api/stock', () => ({ listStockBatches: async () => ({ items: [] }) }));
vi.mock('../../api/retail-prices', () => ({ listRetailPrices: async () => ({ items: [] }) }));
vi.mock('../../api/sales', () => ({
  createSalesOrder: async () => ({ id: 'o1' }),
  updateSalesOrder: async () => ({ id: 'o1' }),
  getSalesOrder: async () => ({ id: 'o1', items: [] }),
}));

beforeAll(() => initI18n());
afterEach(cleanup);

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/sales/new']}>
          <Routes>
            <Route path="/sales/new" element={<SalesFormPage />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('SalesFormPage', () => {
  it('渲染出单据字段、每行的物品选择器与吸底操作条', async () => {
    renderPage();

    // 首帧是加载态（仓库列表在请求中），等它落定
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    // 卖家/买家是必填项，标签必须真的出现（缺失时页面是空白卡）
    expect(screen.getAllByText('发货仓库').length).toBeGreaterThan(0);
    expect(screen.getAllByText('收货门店').length).toBeGreaterThan(0);

    // 每行一个模态选择器（原生 <select> 装不下上千条物品）
    expect(screen.getAllByRole('button', { name: '物品' }).length).toBe(1);

    // 吸底操作条上的主/次按钮
    expect(screen.getByRole('button', { name: '保存草稿' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '取消' })).toBeTruthy();
  });
});
