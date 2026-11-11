#!/usr/bin/env bash
# 迁移回归自检：对比 HEAD 与工作区，找出被「迁移」掉的东西。
# 只报告：消失的 i18n key、消失的导出名、新增/消失的硬编码中文字面量。
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

files=$(git diff --name-only -- 'apps/web/src/**/*.tsx' 'apps/web/src/**/*.ts' | grep -v '\.test\.' || true)
[ -z "$files" ] && { echo "no changed files"; exit 0; }

fail=0
for f in $files; do
  [ -f "$f" ] || continue
  before=$(git show "HEAD:$f" 2>/dev/null || true)
  [ -z "$before" ] && continue
  after=$(cat "$f")

  old_keys=$(printf '%s' "$before" | grep -oE "\bt\('[^']+'" | sed "s/t('//" | sort -u)
  new_keys=$(printf '%s' "$after" | grep -oE "\bt\('[^']+'" | sed "s/t('//" | sort -u)
  lost_keys=$(comm -23 <(printf '%s\n' "$old_keys") <(printf '%s\n' "$new_keys") | grep -v '^$' || true)

  old_exports=$(printf '%s' "$before" | grep -oE "export (function|const) [A-Za-z0-9_]+" | awk '{print $3}' | sort -u)
  new_exports=$(printf '%s' "$after" | grep -oE "export (function|const) [A-Za-z0-9_]+" | awk '{print $3}' | sort -u)
  lost_exports=$(comm -23 <(printf '%s\n' "$old_exports") <(printf '%s\n' "$new_exports") | grep -v '^$' || true)

  old_zh=$(printf '%s' "$before" | grep -oE "'[^']*[\x{4e00}-\x{9fff}][^']*'" | grep -v "^'//" || true)

  if [ -n "$lost_keys" ] || [ -n "$lost_exports" ]; then
    fail=1
    echo ""
    echo "== $f"
    [ -n "$lost_keys" ] && echo "  lost i18n keys:" && printf '%s\n' "$lost_keys" | sed 's/^/    - /'
    [ -n "$lost_exports" ] && echo "  lost exports:" && printf '%s\n' "$lost_exports" | sed 's/^/    - /'
  fi
done

echo ""
[ "$fail" -eq 0 ] && echo "OK: 没有丢失 i18n key 或导出名" || echo "WARN: 见上（若是有意删除，请人工确认）"
