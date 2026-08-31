import { Spinner, Body1 } from '@fluentui/react-components';

export function CallbackPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Spinner />
      <Body1>正在完成登录…</Body1>
    </div>
  );
}
