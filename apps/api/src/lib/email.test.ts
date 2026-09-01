import { describe, expect, it } from 'vitest';

import { mailerStatus, normalizeEmailAddress, resolveConfiguredSender } from './email';

describe('email config validation', () => {
  it('accepts real addresses and rejects placeholder values', () => {
    expect(normalizeEmailAddress('<noreply@example.com>')).toBe('noreply@example.com');
    expect(normalizeEmailAddress('admin@example.com')).toBe('admin@example.com');
    expect(normalizeEmailAddress('<your-mail-from>')).toBeNull();
    expect(normalizeEmailAddress('smtp-user')).toBeNull();
  });

  it('flags invalid sender settings before attempting SMTP delivery', () => {
    const status = mailerStatus({
      MAIL_PROVIDER: 'smtp',
      MAIL_FROM: '<your-mail-from>',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'smtp-user',
      SMTP_PASS: 'secret',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
    } as any);

    expect(status.enabled).toBe(false);
    expect(status.reason).toContain('不是有效的邮箱地址');
  });

  it('prefers a valid MAIL_FROM when present', () => {
    expect(
      resolveConfiguredSender({
        MAIL_FROM: 'admin@example.com',
        SMTP_USER: 'smtp-user',
      } as any),
    ).toBe('admin@example.com');
  });
});
