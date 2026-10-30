// 그림 · 곡 용량 한도 (npm test 가 부른다) — 저사양 폰 · 느린 망에서 게임이 무거워지지 않게.
// 새 원화 · 곡을 넣을 때 이 한도를 넘으면 테스트가 실패한다. 한도를 올리기 전에 먼저 줄일 방법을 찾는다 (CLAUDE.md 「저사양 폰 · 느린 망」).
//   영웅 모션 시트: 칸 384px(4열 × 8행 = 1536×3072) · 1MB 이하. 화면에서 영웅은 약 113px → 기기 픽셀 3배 폰에서 339px 라
//     384 칸이면 충분하다 (더 키우면 받는 양 · 메모리만 늘고 눈에 보이는 차이는 없다). webp 품질 84 (tools/make_hero_hd.py)
//   보스 모션 시트: 칸 256px(4열 × 10행 = 1024×2560) · 950KB 이하 (tools/make_boss_motion.py)
//   영웅 전신 512px · 80KB, 상반신 192px · 24KB, 보스 그림 150KB, 그 밖의 그림 한 장 200KB
//   곡: Vorbis 160kbps 그대로 · 한 곡 1.9MB 이하. 다시 압축하지 않는다 — 110kbps 로 줄여 봤더니 높은음이 지직거렸다.
//     곡은 뒤에서 받기 줄로 차례대로 받고(첫 화면은 메뉴 곡 하나만 기다림), 풀어 둔 크기는 압축과 상관없어 메모리엔 이득이 없다
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const KB = 1024;
const RULES = [
  { re: /^assets\/heroes\/[^/]+_motion\.webp$/, max: 1000 * KB, dim: [1536, 3072] },
  { re: /^assets\/heroes\/[^/]+_bust\.webp$/, max: 24 * KB, dim: [192, 192] },
  { re: /^assets\/heroes\/[^/]+\.webp$/, max: 80 * KB, dim: [512, 512] },
  { re: /^assets\/boss\/[^/]+_motion\.webp$/, max: 950 * KB, dim: [1024, 2560] },   // 보스 40프레임 모션: 칸 256 (원본 생성 그림 약 198px 칸)
  { re: /^assets\/boss\/.+\.webp$/, max: 150 * KB },
  { re: /^assets\/bgm\/.+\.ogg$/, max: 1900 * KB },
  { re: /^assets\/.+\.(webp|png|jpg)$/, max: 200 * KB },
];
// webp 그림 크기 (VP8X · VP8 · VP8L 머리)
function webpSize(b) {
  const t = b.toString('ascii', 12, 16);
  if (t === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (t === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  return null;
}
const walk = d => readdirSync(root + d).flatMap(f => (statSync(`${root}${d}/${f}`).isDirectory() ? walk(`${d}/${f}`) : [`${d}/${f}`]));
let ok = 0;
const bad = [];
for (const f of walk('assets')) {
  const r = RULES.find(r => r.re.test(f));
  if (!r) continue;
  const size = statSync(root + f).size;
  if (size > r.max) bad.push(`${f}: ${Math.round(size / KB)}KB > 한도 ${Math.round(r.max / KB)}KB`);
  else if (r.dim) {
    const wh = webpSize(readFileSync(root + f));
    if (wh && (wh[0] > r.dim[0] || wh[1] > r.dim[1])) bad.push(`${f}: ${wh.join('×')} > 한도 ${r.dim.join('×')}`);
    else ok++;
  } else ok++;
}
bad.forEach(m => console.log(`✗ ${m}`));
console.log(`그림 · 곡 용량 한도: ${ok}개 통과\n\n${bad.length ? 0 : 1} 통과, ${bad.length ? 1 : 0} 실패`);
if (bad.length) process.exit(1);
