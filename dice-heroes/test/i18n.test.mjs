// 다국어 점검: 번역표(lang/en.js · ja.js)와 화면 글자(TR('…'))가 맞는지
//   · 번역의 {n} 자리표시가 원문과 다르면 실패 (화면에 값이 빠지거나 {1} 이 그대로 보인다)
//   · 번역이 없는 문장 · TR 로 감싸지 않은 한국어는 경고만 (영어 · 일본어 화면에 한국어가 보인다)
//     새 한국어를 넣으면: TR('…') 로 감싸고 (tools/i18n-wrap.mjs) lang/en.js · lang/ja.js 에 번역을 더한다
import { readFileSync } from 'node:fs';
import en from '../lang/en.js';
import ja from '../lang/ja.js';

const files = ['config.js', 'tutorial.js', 'app.js', 'engine.js', 'achievements.js', 'skins.js', 'wallet.js', 'wallet-rules.js', 'net.js', 'fire.js', 'dice2d.js', 'run/tour.js', 'run/hand.js', 'run/ui.js', 'run/rules.js'];
const unq = s => s.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
const keys = new Set(), raw = [];
for (const f of files) {
  const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  for (const m of src.matchAll(/\bTR\('((?:[^'\\]|\\.)*)'/g)) keys.add(unq(m[1]));
  src.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/\bTR\('(?:[^'\\]|\\.)*'/g, '');
    if (/^\s*\*|^\s*\/\*/.test(line)) return;
    if (/(['"`])[^'"`]*[가-힣][^'"`]*\1/.test(code) && !/console\.|fail\(`?['"]?모르는/.test(code)) raw.push(`${f}:${i + 1}`);
  });
}
const ph = s => (s.match(/\{\d+\}/g) || []).sort().join(',');
let bad = 0;
for (const [name, d] of [['en', en], ['ja', ja]]) {
  for (const [k, v] of Object.entries(d)) if (ph(k) !== ph(v)) { bad++; console.log(`  ✗ ${name} 자리표시 다름: ${k.slice(0, 50)}`); }
}
const miss = [...keys].filter(k => !(k in en) || !(k in ja));
console.log(`다국어: 문장 ${keys.size} · 번역 없음 ${miss.length} · 감싸지 않은 한국어(추정) ${raw.length}`);
if (miss.length) console.log('  ! 번역이 없는 문장 (영어 · 일본어 화면에 한국어로 보임):\n' + miss.slice(0, 20).map(k => '    ' + k.replace(/\n/g, '⏎').slice(0, 70)).join('\n'));
if (raw.length) console.log('  ! TR 로 감싸지 않은 한국어 (추정):\n' + raw.slice(0, 20).map(x => '    ' + x).join('\n'));
console.log(`\n${bad ? 0 : 1} 통과, ${bad ? 1 : 0} 실패`);
if (bad) process.exit(1);
