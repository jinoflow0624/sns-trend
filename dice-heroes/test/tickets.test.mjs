// 입장권 규칙 테스트: node test/tickets.test.mjs
import assert from 'node:assert/strict';
import { TICKET, fixTix, useTicket, adTicket, dayOf } from '../wallet-rules.js';
import { rewardAd } from '../ads.js';

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n   ', e.message); } };
const DAY = 86400000, now = Date.UTC(2026, 9, 22, 3);

await t('처음엔 10장', () => { const w = {}; fixTix(w, now); assert.equal(w.tix.n, TICKET.start); });
await t('1장 쓰면 9장 · 다 쓰면 거절', () => {
  const w = {};
  assert.equal(useTicket(w, now), null); assert.equal(w.tix.n, 9);
  w.tix.n = 0; assert.equal(typeof useTicket(w, now), 'string'); assert.equal(w.tix.n, 0);
});
await t('다음 날: 5장보다 적으면 5장까지 채움', () => { const w = { tix: { n: 1, day: dayOf(now), ads: 3 } }; fixTix(w, now + DAY); assert.equal(w.tix.n, 5); assert.equal(w.tix.ads, 0); });
await t('다음 날: 5장보다 많으면 그대로', () => { const w = { tix: { n: 8, day: dayOf(now), ads: 0 } }; fixTix(w, now + DAY); assert.equal(w.tix.n, 8); });
await t('같은 날엔 채우지 않음', () => { const w = { tix: { n: 0, day: dayOf(now), ads: 0 } }; fixTix(w, now + 1000); assert.equal(w.tix.n, 0); });
await t('광고 하루 10번까지 +1', () => {
  const w = { tix: { n: 0, day: dayOf(now), ads: 0 } };
  for (let i = 0; i < TICKET.adMax; i++) assert.equal(adTicket(w, now), null);
  assert.equal(w.tix.n, TICKET.adMax);
  assert.equal(typeof adTicket(w, now), 'string');
  assert.equal(w.tix.n, TICKET.adMax);
  fixTix(w, now + DAY); assert.equal(adTicket(w, now + DAY), null);   // 다음 날 다시
});
await t('광고가 꺼져 있으면 보상형 광고는 none (광고 없이 보상)', async () => assert.equal(await rewardAd(), 'none'));

console.log(`\n${pass} 통과, ${fail} 실패`);
if (fail) process.exit(1);
