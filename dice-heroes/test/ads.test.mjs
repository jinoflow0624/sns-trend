// 광고 빈도 규칙 테스트: node test/ads.test.mjs
import assert from 'node:assert/strict';
import { due, RULES, breakThen, initAds, gameOver } from '../ads.js';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n   ', e.message); } };
const MIN = 60 * 1000;

t('기본 규칙: 2판에 1번 · 최소 3분', () => { assert.equal(RULES.every, 2); assert.equal(RULES.gapMs, 3 * MIN); });
t('한 판만 했으면 광고 없음', () => assert.equal(due({ games: 1, last: 0 }, 10 * MIN), false));
t('두 판 · 3분 지남 → 광고', () => assert.equal(due({ games: 2, last: 0 }, 10 * MIN), true));
t('두 판이어도 직전 광고 뒤 3분 안이면 없음', () => assert.equal(due({ games: 2, last: 10 * MIN }, 12 * MIN), false));
t('3분이 지나면 다시 가능', () => assert.equal(due({ games: 3, last: 10 * MIN }, 13 * MIN), true));
t('규칙을 바꿀 수 있다 (3판에 1번)', () => assert.equal(due({ games: 2, last: 0 }, 10 * MIN, { every: 3, gapMs: 0 }), false));

// 브라우저가 아닌 곳(스크립트 없음)에서는 광고 없이 바로 넘어간다
t('광고가 꺼져 있으면 바로 다음으로', () => { let n = 0; breakThen(() => n++); assert.equal(n, 1); });
t('켜져 있어도 스크립트가 준비되지 않았으면 바로 다음으로', () => {
  initAds({ enabled: true, test: true });
  gameOver('a'); gameOver('b');
  let n = 0; breakThen(() => n++); assert.equal(n, 1);
});
t('광고 제거 권리가 있으면 바로 다음으로', () => {
  initAds({ enabled: true, adFree: () => true });
  let n = 0; breakThen(() => n++); assert.equal(n, 1);
});

console.log(`\n${pass} 통과, ${fail} 실패`);
if (fail) process.exit(1);
