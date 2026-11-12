import { describe, expect, it } from 'vitest';

import { navKeyForPath } from './document-title';

// 纯函数：路径归到哪个导航项。错在「全部落到站点名」时，多标签页和读屏都分不清页面。
describe('navKeyForPath', () => {
  it('首页归到工作台，而不是被前缀匹配吞掉', () => {
    expect(navKeyForPath('/')).toBe('dashboard');
  });

  it('列表页按自身路径匹配', () => {
    expect(navKeyForPath('/sales')).toBe('sales');
    expect(navKeyForPath('/inventory')).toBe('inventory');
  });

  it('详情页按最长前缀归到所属模块', () => {
    expect(navKeyForPath('/sales/abc-123')).toBe('sales');
    expect(navKeyForPath('/shipments/xyz/edit')).toBe('shipments');
    expect(navKeyForPath('/admin/users/42')).toBe('adminUsers');
  });

  it('不把 /sales 之类的模块前缀错配到别的模块', () => {
    // /returns 与 /retail-prices 都以 /ret 开头，必须靠整段路径而不是字符前缀
    expect(navKeyForPath('/returns/1')).toBe('returns');
    expect(navKeyForPath('/retail-prices')).toBe('retailPrices');
  });

  it('认不出的路径返回 null（调用方退回站点名）', () => {
    expect(navKeyForPath('/login')).toBeNull();
    expect(navKeyForPath('/nope/deep/path')).toBeNull();
  });
});
