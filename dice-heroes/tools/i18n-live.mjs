// 파일을 불러올 때(모듈 맨 위 · 거기서 바로 도는 forEach/map 콜백) 부르는 TR → tL (살아 있는 글자) 로 바꾼다.
// 그런 tL 을 `${}` · + 로 이어 붙인 식은 live(() => …) 로 감싼다 (이어 붙인 결과도 언어를 따라가게).
//   npm i --no-save acorn@8 acorn-walk@8 && node tools/i18n-live.mjs <파일…> [--dry]
// 함수 안(화면을 그릴 때) TR 은 그대로 둔다 — 그때그때 지금 언어로 번역되므로.
import { readFileSync, writeFileSync } from 'node:fs';
import * as acorn from 'acorn';
import { ancestor } from 'acorn-walk';

const IMMEDIATE = new Set(['forEach', 'map', 'flatMap', 'filter', 'reduce', 'find', 'some', 'every', 'from', 'fromEntries', 'sort']);
const args = process.argv.slice(2), dry = args.includes('--dry');
for (const file of args.filter(a => !a.startsWith('--'))) {
  const src = readFileSync(file, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true, locations: true });
  // 불러올 때 도는 자리인가: 감싼 함수가 모두 '바로 부르는 콜백'(위 이름의 호출 인자) 이면 그렇다
  const loadTime = anc => {
    for (let i = anc.length - 1; i >= 0; i--) {
      const a = anc[i];
      if (!/Function/.test(a.type)) continue;
      const p = anc[i - 1];
      if (!p || p.type !== 'CallExpression') return false;
      if (p.callee === a) continue;                                   // (() => …)() 바로 부르기
      if (!p.arguments.includes(a)) return false;
      const name = p.callee.type === 'MemberExpression' ? p.callee.property.name : p.callee.name;
      if (!IMMEDIATE.has(name)) return false;
    }
    return true;
  };
  const trs = [], joins = [];
  ancestor(ast, {
    CallExpression(n, anc) { if (n.callee.type === 'Identifier' && n.callee.name === 'TR' && loadTime(anc)) trs.push(n); },
  });
  const isIn = (x, y) => x.start >= y.start && x.end <= y.end;
  ancestor(ast, {
    TemplateLiteral(n, anc) { if (loadTime(anc) && anc.at(-2)?.type !== 'TaggedTemplateExpression' && trs.some(c => isIn(c, n))) joins.push(n); },
    BinaryExpression(n, anc) { if (n.operator === '+' && loadTime(anc) && trs.some(c => isIn(c, n))) joins.push(n); },
  });
  // 가장 바깥 이어 붙이기만 감싼다
  const outer = joins.filter(j => !joins.some(k => k !== j && isIn(j, k)));
  const edits = [
    ...trs.map(c => ({ s: c.callee.start, e: c.callee.end, text: 'tL' })),
    ...outer.flatMap(j => [{ s: j.start, e: j.start, text: 'live(() => ' }, { s: j.end, e: j.end, text: ')' }]),
  ].sort((a, b) => b.s - a.s || b.e - a.e);
  let out = src;
  for (const x of edits) out = out.slice(0, x.s) + x.text + out.slice(x.e);
  if (trs.length) {
    // import 에 tL · live 더하기
    out = out.replace(/import \{ t as TR \} from '([^']*i18n\.js)';/, (m, p) => `import { t as TR, tL${outer.length ? ', live' : ''} } from '${p}';`);
    if (!out.includes(' tL')) console.warn('! import 를 못 고침:', file);
  }
  if (!dry) writeFileSync(file, out);
  console.log(`${file}: tL ${trs.length} · live ${outer.length}${outer.length ? ' (줄 ' + outer.map(j => j.loc.start.line).join(',') + ')' : ''}`);
}
