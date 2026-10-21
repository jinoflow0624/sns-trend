// 모든 스크립트 문법 검사 + 합치기 충돌 표시(<<<<<<< ======= >>>>>>>)가 남지 않았는지 — node test/syntax.test.mjs
// 화면 코드(app.js · run/ui.js 등)는 다른 시험이 불러오지 않아서, 충돌 표시가 남은 채 합쳐져도 시험이 통과했다 (원정이 통째로 안 열림)
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['node_modules', 'vendor', 'dist', '.git']);
const files = [];
const walk = d => { for (const f of readdirSync(d)) { if (SKIP.has(f)) continue; const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(m?js|css|html)$/.test(f)) files.push(p); } };
walk(ROOT);
let ok = 0, bad = 0;
for (const f of files) {
  const rel = relative(ROOT, f), txt = readFileSync(f, 'utf8');
  const mark = txt.split('\n').findIndex(l => /^(<<<<<<< |=======$|>>>>>>> )/.test(l));
  if (mark >= 0) { bad++; console.log(`  ✗ ${rel}:${mark + 1} 합치기 충돌 표시가 남아 있다`); continue; }
  if (/\.m?js$/.test(f)) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) { bad++; console.log(`  ✗ ${rel} 문법 오류\n${String(e.stderr).split('\n').slice(0, 4).join('\n')}`); continue; }
  }
  ok++;
}
console.log(`\n${ok} 통과, ${bad} 실패 (문법 · 충돌 표시)`);
if (bad) process.exit(1);
