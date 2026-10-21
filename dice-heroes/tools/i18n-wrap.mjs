// 사용: npm i --no-save acorn@8 acorn-walk@8 → node tools/i18n-wrap.mjs <파일> <i18n.js 상대경로>  (예: run/ui.js ../i18n.js)
// 한국어 글자를 t('…', 값…) 로 감싼다.  node wrap.mjs <파일> <i18n 상대경로> [--dry]
// · 문자열 '…' / 템플릿 `…${x}…` 안의 한국어. HTML 이 섞이면 글자 덩어리(태그 사이 · 따옴표 속성값)마다 따로 감싼다
// · 건너뜀: 객체 키 · import · console.* · switch case · 이미 t(…) 안 · 정규식
import { readFileSync, writeFileSync } from 'node:fs';
import * as acorn from 'acorn';
import { simple, ancestor } from 'acorn-walk';

const [file, rel, flag] = process.argv.slice(2);
const src = readFileSync(file, 'utf8');
const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true });

const targets = [];
ancestor(ast, {
  Literal(node, anc) { if (typeof node.value === 'string' && HANGUL.test(node.value) && ok(node, anc)) targets.push(node); },
  TemplateLiteral(node, anc) { if (node.quasis.some(q => HANGUL.test(q.value.cooked ?? '')) && ok(node, anc)) targets.push(node); },
});
function ok(node, anc) {
  const p = anc[anc.length - 2];
  if (!p) return true;
  if (p.type === 'Property' && p.key === node && !p.computed) return false;
  if (p.type === 'ImportDeclaration' || p.type === 'ExportNamedDeclaration' || p.type === 'ExportAllDeclaration' || p.type === 'ImportExpression') return false;
  if (p.type === 'TaggedTemplateExpression') return false;
  if (p.type === 'SwitchCase' && p.test === node) return false;
  if (p.type === 'MemberExpression' && p.property === node) return false;
  for (let i = anc.length - 2; i >= 0; i--) {
    const a = anc[i];
    if (a.type === 'CallExpression') {
      const c = a.callee;
      if (c.type === 'Identifier' && c.name === 'TR') return false;
      if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'console') return false;
    }
  }
  return true;
}
targets.sort((a, b) => a.start - b.start);

const keys = new Set();
const esc = s => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const q = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

// [start,end) 구간을 옮겨 쓰되 그 안의 대상은 바꿔 쓴다
function emit(s, e) {
  let out = '', pos = s;
  for (const n of targets) {
    if (n.start < pos || n.end > e) continue;
    out += src.slice(pos, n.start) + conv(n);
    pos = n.end;
  }
  return out + src.slice(pos, e);
}

// 조각: { c: 글자 } | { x: 식 소스 }
function conv(n) {
  let parts;
  if (n.type === 'Literal') parts = [...n.value].map(c => ({ c }));
  else {
    parts = [];
    n.quasis.forEach((qq, i) => {
      for (const c of qq.value.cooked) parts.push({ c });
      if (i < n.expressions.length) parts.push({ x: emit(n.expressions[i].start, n.expressions[i].end) });
    });
  }
  const html = parts.some((p, i) => p.c === '<' && /[a-zA-Z/!]/.test(parts[i + 1]?.c || ''));
  // 덩어리 나누기: 태그 밖 글자 · 따옴표 속성값
  const segs = [];       // { kind: 'static' | 'run', parts }
  let cur = { kind: 'run', parts: [] };
  const flush = kind => { if (cur.parts.length) segs.push(cur); cur = { kind, parts: [] }; };
  if (!html) cur.parts = parts;
  else {
    let mode = 'text', quote = null;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (mode === 'text') {
        if (p.c === '<' && /[a-zA-Z/!]/.test(parts[i + 1]?.c || '')) { flush('static'); mode = 'tag'; cur.parts.push(p); continue; }
        cur.parts.push(p);
      } else if (mode === 'tag') {
        cur.parts.push(p);
        if (p.c === '"' || p.c === "'") { flush('run'); mode = 'attr'; quote = p.c; continue; }
        if (p.c === '>') { flush('run'); mode = 'text'; }
      } else {   // attr
        if (p.c === quote) { flush('static'); cur.parts.push(p); mode = 'tag'; continue; }
        cur.parts.push(p);
      }
    }
  }
  flush('static');
  // 덩어리마다: 한국어가 있으면 t(…) — 앞뒤 공백은 밖으로
  let tmpl = '', anyT = false, onlyOne = null;
  const staticOut = ps => ps.map(p => (p.x != null ? '${' + p.x + '}' : esc(p.c))).join('');
  for (const sg of segs) {
    const hasK = sg.kind === 'run' && sg.parts.some(p => p.c != null && HANGUL.test(p.c));
    if (!hasK) { tmpl += staticOut(sg.parts); continue; }
    let a = 0, b = sg.parts.length;
    while (a < b && sg.parts[a].c != null && /\s/.test(sg.parts[a].c)) a++;
    while (b > a && sg.parts[b - 1].c != null && /\s/.test(sg.parts[b - 1].c)) b--;
    const core = sg.parts.slice(a, b), args = [];
    let key = '';
    for (const p of core) { if (p.x != null) { key += `{${args.length}}`; args.push(p.x); } else key += p.c; }
    keys.add(key);
    const call = `TR(${q(key)}${args.map(x => ', ' + x).join('')})`;
    tmpl += staticOut(sg.parts.slice(0, a)) + '${' + call + '}' + staticOut(sg.parts.slice(b));
    anyT = true;
    if (segs.length === 1 && a === 0 && b === sg.parts.length) onlyOne = call;
  }
  if (!anyT) return src.slice(n.start, n.end);
  return onlyOne ?? '`' + tmpl + '`';
}

let out = emit(0, src.length);
if (keys.size && !/import \{[^}]*\bTR\b[^}]*\} from '[^']*i18n\.js'/.test(out)) {
  // 첫 import 앞에 (없으면 맨 위 주석 뒤)
  const m = /^import /m.exec(out);
  const line = `import { t as TR } from '${rel}';\n`;
  out = m ? out.slice(0, m.index) + line + out.slice(m.index) : line + out;
}
if (flag !== '--dry') writeFileSync(file, out);
// (새 문장 목록은 node test/i18n.test.mjs 가 알려 준다)
console.log(`${file}: 대상 ${targets.length} · 문장 ${keys.size}`);
