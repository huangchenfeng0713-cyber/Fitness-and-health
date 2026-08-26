/**
 * 跨模块引用检查。
 *
 * 起因：把「身体信息」卡抽成模块时，通用的 field() 跟着搬走了，
 * 设置页还在调用它——整个设置抽屉当场白屏（field is not defined）。
 * 单元测试全绿、模块也能正常 import，因为报错发生在函数被调用的那一刻。
 *
 * 仓库不引入依赖，所以没有 eslint 的 no-undef。这里手写一个够用的版本：
 * 只盯「共享模块导出的函数名」——一个文件调用了 foo()，foo 又是 lib/core/data
 * 里导出的名字，而这个文件既没导入它也没在本地定义，那就是漏了 import。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const walk = (dir) => readdirSync(new URL(`${dir}/`, root), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory()
    ? walk(`${dir}/${e.name}`)
    : (e.name.endsWith('.js') ? [`${dir}/${e.name}`] : [])));

/** 去掉注释再扫，否则文档注释里写的 foo() 会被当成调用 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

const ALL = walk('js');
const SHARED = ALL.filter((f) => /^js\/(lib|core|data)\//.test(f));

/** 一个模块导出的函数名 */
function exportedFunctions(src) {
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+const\s+(\w+)\s*=\s*(?:\(|async|function)/gm)) names.add(m[1]);
  return names;
}

/** 一个模块里本地可见的名字：import 进来的 + 自己定义的 */
function localNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  for (const m of src.matchAll(/import\s+(\w+)\s*(?:,|from)/g)) names.add(m[1]);
  for (const m of src.matchAll(/import\s*\*\s*as\s+(\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/(?:^|\s)(?:export\s+)?(?:const|let|var)\s+(\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/(?:^|\s)class\s+(\w+)/g)) names.add(m[1]);
  // 解构赋值，含 const { a } = await import('...') 这种动态导入
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/[:=]/)[0].trim();
      if (/^\w+$/.test(name)) names.add(name);
    }
  }
  // 对象字面量 / class 里的方法简写：async clear({...}) { 不是调用
  for (const m of src.matchAll(/^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/gm)) names.add(m[1]);
  return names;
}

test('每个模块调用的共享函数都真的导入了', () => {
  // 共享模块导出的函数名 → 定义在哪个文件
  const sharedFns = new Map();
  for (const file of SHARED) {
    for (const name of exportedFunctions(read(file))) {
      if (!sharedFns.has(name)) sharedFns.set(name, file);
    }
  }
  assert.ok(sharedFns.size > 20, `共享函数收集得太少：${sharedFns.size}`);

  const misses = [];
  for (const file of ALL) {
    const src = stripComments(read(file));
    const local = localNames(src);
    for (const [name, from] of sharedFns) {
      if (from === file || local.has(name)) continue;
      // 调用点：foo( 前面不能是点号（排除 obj.foo()）或标识符字符
      const called = new RegExp(`(^|[^.\\w$])${name}\\s*\\(`, 'm').test(src);
      if (called) misses.push(`${file} 调用了 ${name}()，但没有从 ${from} 导入`);
    }
  }
  assert.deepEqual(misses, [], `\n${misses.join('\n')}`);
});

test('视图之间不互相 import，避免循环依赖', () => {
  // 卡片要在多个页面复用，就该抽进 views/cards/，而不是让两个页面互相 import
  const bad = [];
  for (const file of ALL.filter((f) => /^js\/views\/[^/]+\.js$/.test(f))) {
    for (const m of read(file).matchAll(/from\s+'\.\/(\w[\w-]*)\.js'/g)) {
      bad.push(`${file} 直接 import 了同级视图 ${m[1]}.js`);
    }
  }
  assert.deepEqual(bad, [], `\n${bad.join('\n')}`);
});
