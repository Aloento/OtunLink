#!/usr/bin/env node
/**
 * i18n key 静态校验：把源码里所有 `t('a.b.c')` 的字面量 key 拿去 zh-CN 资源里解析，
 * 找不存在的 key（运行时会在界面上直接显示 key 本身）。
 *
 * - 只检查字符串字面量；模板拼接（t(`items.x.${v}`)）无法静态验证，跳过并计数。
 * - 同时检查 en 资源是否也有同名 key（en 结构由 zh 约束，这里做冗余校验）。
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();

function loadResource(file) {
  const src = readFileSync(path.join(root, file), 'utf8');
  // 资源文件形如 `export const zhCN = { … }`（后面还有 export type），
  // 用花括号配对截出对象字面量，再交给 Function 求值。
  const eq = src.indexOf('= {');
  if (eq < 0) throw new Error(`${file}: 找不到对象字面量`);
  const start = src.indexOf('{', eq);
  let depth = 0;
  let end = -1;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`${file}: 花括号未闭合`);
  // eslint-disable-next-line no-new-func
  return new Function(`return ${src.slice(start, end + 1)}`)();
}

const zh = loadResource('apps/web/src/i18n/resources/zh-CN.ts');
const en = loadResource('apps/web/src/i18n/resources/en.ts');

function resolve(obj, key) {
  let cur = obj;
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object' || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

const files = execSync('git ls-files --cached --others --exclude-standard "apps/web/src/**/*.ts" "apps/web/src/**/*.tsx"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => existsSync(path.join(root, f)))
  .filter((f) => !f.includes('/i18n/resources/') && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));

const literal = /\bt\(\s*'([^'\\]+)'/g;
const dynamic = /\bt\(\s*`/g;

let missing = 0;
let dynamicCount = 0;
const checked = new Set();

for (const file of files) {
  const src = readFileSync(path.join(root, file), 'utf8');
  dynamicCount += (src.match(dynamic) ?? []).length;
  for (const match of src.matchAll(literal)) {
    const key = match[1];
    if (checked.has(key)) continue;
    checked.add(key);
    const line = src.slice(0, match.index).split('\n').length;
    if (resolve(zh, key) === undefined) {
      console.log(`MISSING(zh) ${file}:${line}  ${key}`);
      missing += 1;
    } else if (resolve(en, key) === undefined) {
      console.log(`MISSING(en) ${file}:${line}  ${key}`);
      missing += 1;
    }
  }
}

console.log(`\nchecked ${checked.size} unique literal keys in ${files.length} files`);
console.log(`dynamic template keys skipped: ${dynamicCount}`);
console.log(missing === 0 ? 'OK: 所有字面量 key 都存在' : `FAIL: ${missing} 个 key 缺失`);
process.exit(missing === 0 ? 0 : 1);
