// 영웅 · 보스 그림의 주소 버전(?v=…)을 파일 내용 해시로 만든다 → asset-ver.js
//   node tools/asset-ver.mjs          (다시 만들기)
//   node tools/asset-ver.mjs --check  (지금 그림과 맞는지만 — npm test 가 부른다)
// 예전엔 게임 버전(?v=0.39.x)을 붙여서, 업데이트마다 바뀌지 않은 영웅 · 보스 그림 · 모션 시트(약 8MB)까지 다시 받았다.
// 이제 그림 파일이 바뀐 것만 새로 받는다. 주사위 · 트레이(skins.js ART_VER) · 원정(run/art.js RUN_ART_VER) · 곡(audio.js BGM_VER)은 따로 올린다.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const DIRS = ['assets/heroes', 'assets/boss'];
const map = {};
for (const d of DIRS) for (const f of readdirSync(root + d).filter(f => f.endsWith('.webp')).sort()) {
  map[`${d}/${f}`] = createHash('sha1').update(readFileSync(`${root}${d}/${f}`)).digest('hex').slice(0, 8);
}
const src = `// 자동 생성 (node tools/asset-ver.mjs) — 영웅 · 보스 그림 파일 내용 해시. 그림을 바꾸면 다시 만든다 (npm test 가 알려 준다)
export const AV = ${JSON.stringify(map, null, 0).replace(/","/g, '",\n  "').replace('{', '{\n  ').replace(/}$/, ',\n}')};
// 그림 주소 + 버전 (목록에 없으면 'new' — 새 파일을 넣고 아직 만들지 않았을 때)
export const artURL = path => \`\${path}?v=\${AV[path] || 'new'}\`;
`;
const file = root + 'asset-ver.js';
if (process.argv.includes('--check')) {
  let cur = ''; try { cur = readFileSync(file, 'utf8'); } catch {}
  if (cur !== src) { console.log('✗ 영웅 · 보스 그림이 바뀌었는데 asset-ver.js 가 예전 것이에요 → node tools/asset-ver.mjs'); process.exit(1); }
  console.log(`그림 주소 버전: ${Object.keys(map).length}개 파일 · 최신\n\n1 통과, 0 실패`);
} else { writeFileSync(file, src); console.log(`asset-ver.js: ${Object.keys(map).length}개`); }
