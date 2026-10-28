// 배포판 빌드: ../dice-heroes (테스트판 소스) → dist/public
//   node build.mjs            설정이 비어 있으면 멈춘다
//   node build.mjs --emu      에뮬레이터 점검용 (설정이 비어 있어도 가짜 값으로 빌드)
//
// 하는 일
//   1. 게임 파일을 복사한다 (test · sim · 개발용 파일 제외)
//   2. env.js 를 'prod' 로, fireconfig.js 를 fireconfig.prod.js 로 바꾼다
//   3. 서비스 워커의 Firebase 번들 이름을 전체판(firebase-full.js)으로 바꾼다
//   4. twa/assetlinks.json 이 있으면 .well-known/ 에 넣는다 (구글 플레이 앱 ↔ 사이트 연결)
//   5. 서버(functions/shared/)에 보상 규칙 · 엔진 사본을 넣는다
//   6. 애드센스: 사이트 소유 확인용 메타 태그와 ads.txt 를 넣는다 (광고 스크립트는 게임이 필요할 때만 불러온다)
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'dice-heroes');
const out = join(here, 'dist', 'public');
const emu = process.argv.includes('--emu');

let conf = readFileSync(join(here, 'fireconfig.prod.js'), 'utf8');
if (conf.includes('REPLACE_ME')) {
  if (!emu) {
    console.error('✗ fireconfig.prod.js 에 아직 REPLACE_ME 가 있습니다. Firebase 콘솔의 웹 앱 구성 값을 넣어 주세요.');
    process.exit(1);
  }
  conf = conf.replaceAll('REPLACE_ME', 'demo-diceheroes').replace(/databaseURL: '[^']*'/, "databaseURL: 'http://127.0.0.1:9100?ns=demo-diceheroes-default-rtdb'");
}

// 테스트판 전용 코드 잘라내기: 「// @test-only{」 ~ 「// }@test-only」 줄 구간과 /*TEST{*/ … /*}TEST*/ 를 지운다
// (시험 원정 · 다이아 무제한 · 잠금 되돌리기 · 시험용 승천 · ?demon · ?debug — 배포판에는 코드째로 넣지 않는다)
const TEST_LEFT = ['trialKit', 'sandbox', 'showSandbox', 'sbAct', 'TEST_GEMS', 'TEST_TIX', 'relockLocal', "data-act=\"relock\"", '__dh', "get('castle')", "has('demon')", "['dancer']"];
function stripTest(dir) {
  const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.js') ? [join(d, e.name)] : []));
  for (const f of walk(dir)) {
    if (/[\\/](vendor|lang|node_modules)[\\/]/.test(f)) continue;
    const s = readFileSync(f, 'utf8');
    if (!s.includes('@test-only') && !s.includes('TEST{')) continue;
    let o = s.replace(/\/\*TEST\{\*\/[\s\S]*?\/\*\}TEST\*\//g, '');
    o = o.replace(/^[ \t]*\/\/ @test-only\{[^\n]*\n[\s\S]*?^[ \t]*\/\/ \}@test-only[^\n]*\n/gm, '');
    if (/^[ \t]*\/\/ (@test-only\{|\}@test-only)/m.test(o) || /\/\*\}?TEST\{?\*\//.test(o)) throw new Error(`테스트 구간 표시가 짝이 안 맞아요: ${f}`);
    const left = TEST_LEFT.filter(k => o.includes(k));
    if (left.length) throw new Error(`테스트 전용 코드가 남았어요 (${left.join(', ')}): ${f}`);
    writeFileSync(f, o);
    execFileSync(process.execPath, ['--check', f]);   // 잘라낸 뒤에도 문법이 맞는지
  }
}

// run/ = 원정(로그라이크) 모드 — 배포판에도 넣는다 (서버 xStart · xFinish 가 기록 · 별조각을 지킨다)
const SKIP = new Set(['test', 'sim', 'tools', 'node_modules', 'README.md', 'CLAUDE.md', 'DESIGN-HANDOFF.md', 'package.json', 'package-lock.json']);
rmSync(join(here, 'dist'), { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(src, out, { recursive: true, filter: p => { const rel = p.slice(src.length + 1); return !SKIP.has(rel.split(/[\\/]/)[0]) && !/^run[\\/].*\.md$/.test(rel); } });

writeFileSync(join(out, 'env.js'), "// 배포판 빌드 (dice-heroes-prod/build.mjs 가 만든 파일)\nexport const ENV = 'prod';\n");
writeFileSync(join(out, 'fireconfig.js'), conf);
rmSync(join(out, 'vendor', 'firebase.js'));   // 배포판은 전체판만 쓴다
stripTest(out);

const sw = join(out, 'sw.js');
writeFileSync(sw, readFileSync(sw, 'utf8').replace("'vendor/firebase.js'", "'vendor/firebase-full.js'"));

const links = join(here, 'twa', 'assetlinks.json');
if (existsSync(links)) {
  mkdirSync(join(out, '.well-known'), { recursive: true });
  cpSync(links, join(out, '.well-known', 'assetlinks.json'));
} else {
  console.warn('! twa/assetlinks.json 이 없어 .well-known 을 건너뜁니다 (구글 플레이 앱을 만든 뒤 추가).');
}

// 5. 서버(Cloud Functions)가 쓰는 규칙 · 엔진 사본 — 게임과 같은 파일로 보상을 계산하고 온라인 판 결과를 확인한다
const shared = join(here, 'functions', 'shared');
rmSync(shared, { recursive: true, force: true });
mkdirSync(shared, { recursive: true });
for (const f of ['wallet-rules.js', 'engine.js', 'achievements.js', 'i18n.js']) cpSync(join(src, f), join(shared, f));   // i18n.js: 서버에서는 언제나 한국어
// 원정 규칙: 서버가 행동 기록을 다시 돌려 결과를 계산한다 (xStart · xFinish)
mkdirSync(join(shared, 'run'), { recursive: true });
cpSync(join(src, 'run', 'rules.js'), join(shared, 'run', 'rules.js'));
writeFileSync(join(shared, 'package.json'), '{ "type": "module" }\n');
stripTest(shared);

// 6. 애드센스 게시자 ID (비밀 값 아님) — 게임의 ads.js 와 같은 값을 쓴다. 사이트 소유 확인 + ads.txt 용.
//    광고 자체는 게임(ads.js)이 Remote Config ads_enabled 가 켜졌을 때만 불러온다.
const ADSENSE_PUB = /ADS_CLIENT = 'ca-(pub-\d+)'/.exec(readFileSync(join(src, 'ads.js'), 'utf8'))[1];
const html = join(out, 'index.html');
writeFileSync(html, readFileSync(html, 'utf8').replace('</head>', `<meta name="google-adsense-account" content="ca-${ADSENSE_PUB}">\n</head>`));
writeFileSync(join(out, 'ads.txt'), `google.com, ${ADSENSE_PUB}, DIRECT, f08c47fec0942fa0\n`);

const version = /version:\s*'([^']+)'/.exec(readFileSync(join(src, 'config.js'), 'utf8'))?.[1];
console.log(`✓ 배포판 v${version} → ${out}${emu ? ' (에뮬레이터용)' : ''}`);
