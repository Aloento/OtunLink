import { describe, expect, it } from 'vitest';

import { selectView } from './view';

describe('selectView', () => {
  it('回调路径优先显示 callback 视图', () => {
    expect(selectView('/auth/callback', false, null)).toBe('callback');
    expect(selectView('/auth/callback', true, 'ACTIVE')).toBe('callback');
  });

  it('未登录显示登录页', () => {
    expect(selectView('/', false, null)).toBe('login');
  });

  it('已登录但账号信息未加载时显示 loading', () => {
    expect(selectView('/', true, null)).toBe('loading');
    expect(selectView('/', true, undefined)).toBe('loading');
  });

  it('PENDING / DISABLED 显示引导页', () => {
    expect(selectView('/', true, 'PENDING')).toBe('pending');
    expect(selectView('/', true, 'DISABLED')).toBe('pending');
  });

  it('ACTIVE 显示首页', () => {
    expect(selectView('/', true, 'ACTIVE')).toBe('home');
  });
});
