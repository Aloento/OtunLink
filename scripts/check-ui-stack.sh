#!/usr/bin/env bash
# UI 技术栈护栏：这三条一旦破防，上一轮按 Modern Web Guidance 做的可访问性修正就白做了。
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
fail=0

check() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "ok    $label"
  else
    echo "FAIL  $label"
    fail=1
  fi
}

# 1. 原生 dialog 不能退化成自建模态
check "无 role=\"dialog\" / aria-modal" bash -c "! grep -rnE 'role=\"dialog\"|aria-modal' apps/web/src --include='*.ts' --include='*.tsx' | grep -v '\\.test\\.' | grep -vE ':[0-9]+:\\s*(\\*|//)'"

# 2. 不引入第二套 primitives（radix-ui 伞包 / Base UI）
check "无 radix-ui 伞包与 @base-ui" bash -c "! grep -qE '\"(radix-ui|@base-ui/react)\"' apps/web/package.json"

# 3. 只有日间模式
check "无 dark: 变体" bash -c "! grep -rq 'dark:' apps/web/src"

# 4. 不再用 window.confirm
check "无 window.confirm" bash -c "! grep -rn 'window.confirm' apps/web/src --include='*.tsx' | grep -vE ':[0-9]+:\\s*(\\*|//)'"

[ "$fail" = "0" ] && echo "UI 护栏全部通过" || echo "UI 护栏存在失败项"
exit "$fail"
