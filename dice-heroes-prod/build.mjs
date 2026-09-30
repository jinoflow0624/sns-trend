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
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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

const SKIP = new Set(['test', 'sim', 'tools', 'node_modules', 'README.md', 'package.json', 'package-lock.json']);
rmSync(join(here, 'dist'), { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(src, out, { recursive: true, filter: p => !SKIP.has(p.slice(src.length + 1).split(/[\\/]/)[0]) });

writeFileSync(join(out, 'env.js'), "// 배포판 빌드 (dice-heroes-prod/build.mjs 가 만든 파일)\nexport const ENV = 'prod';\n");
writeFileSync(join(out, 'fireconfig.js'), conf);
rmSync(join(out, 'vendor', 'firebase.js'));   // 배포판은 전체판만 쓴다

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
for (const f of ['wallet-rules.js', 'engine.js']) cpSync(join(src, f), join(shared, f));
writeFileSync(join(shared, 'package.json'), '{ "type": "module" }\n');

const version = /version:\s*'([^']+)'/.exec(readFileSync(join(src, 'config.js'), 'utf8'))?.[1];
console.log(`✓ 배포판 v${version} → ${out}${emu ? ' (에뮬레이터용)' : ''}`);
