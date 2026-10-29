// index.html 의 modulepreload 목록을 app.js 가 처음 불러오는 코드 파일 전부로 맞춘다
//   node tools/preload.mjs          (고치기)
//   node tools/preload.mjs --check  (npm test 가 부른다 — 어긋나면 실패)
// 목록이 있으면 브라우저가 코드 파일을 한꺼번에 받는다. 없으면 app.js → 그 안의 import → 또 그 안의 import … 순서로
// 한 겹씩 받아서, 느린 망(왕복 0.15초)에서 첫 화면이 몇 초 늦어진다.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, relative } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const seen = [];
function walk(f) {
  if (seen.includes(f)) return;
  seen.push(f);
  const src = readFileSync(join(root, f), 'utf8');
  for (const m of src.matchAll(/^import[^'"]*?from\s+['"](\.[^'"]+)['"]|^import\s+['"](\.[^'"]+)['"]/gm)) walk(normalize(join(dirname(f), m[1] || m[2])));
}
walk('app.js');
const list = seen.slice(1);
const block = `<!-- modulepreload: 자동 (node tools/preload.mjs) — 첫 화면 코드를 한꺼번에 받는다 -->\n${list.map(f => `<link rel="modulepreload" href="${f}">`).join('\n')}\n<!-- /modulepreload -->`;
const file = join(root, 'index.html');
const html = readFileSync(file, 'utf8');
const re = /<!-- modulepreload:[\s\S]*?<!-- \/modulepreload -->/;
const next = re.test(html) ? html.replace(re, block) : html.replace('<link rel="stylesheet" href="style.css">', `<link rel="stylesheet" href="style.css">\n${block}`);
if (process.argv.includes('--check')) {
  if (next !== html) { console.log('✗ index.html 의 modulepreload 목록이 app.js 의 import 와 달라요 → node tools/preload.mjs'); process.exit(1); }
  console.log(`첫 화면 코드 미리 받기: ${list.length}개 · 최신\n\n1 통과, 0 실패`);
} else { writeFileSync(file, next); console.log(`index.html modulepreload ${list.length}개`); }
