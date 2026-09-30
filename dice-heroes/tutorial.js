// 첫 실행 튜토리얼 — 결과가 정해진 주사위로 2라운드를 직접 해 보며 배운다.
// 단계마다 강조할 화면 요소(target), 누를 수 있는 동작(allow), 넘어가는 조건(done)을 적는다.
// tap: 손가락으로 가리킬 곳 (선택자 또는 { die: 번호 }) — 없으면 target 가운데를 가리킨다.
// tool 은 지금 켜 둔 기술(뒤집기·조정) — 켜기 전엔 버튼을, 켠 뒤엔 누를 주사위를 가리킨다.
import * as E from './engine.js';

export function createTutorialGame(name = '나') {
  const s = E.createGame([{ name, cls: 'warrior' }], 20260927);
  s.tutorial = true;
  s.board = ['quad', 'six3', 'rainbow'];
  s.deck = s.deck.filter(q => !s.board.includes(q));
  s.events = new Array(E.ROUNDS).fill('calm');
  s.script = [
    [6, 6, 2, 6, 3],   // 1라운드 첫 굴림: 6이 세 개
    [6, 6, 5, 6, 6],   // 다시 굴림: 6이 네 개 → 포카인드 + 의뢰
    [1, 3, 4, 5, 1],   // 2라운드: 뒤집기·조정으로 라지 스트레이트
  ];
  E.drainFx(s);
  return s;
}

const heldExactly = (s, idx) => s.held.every((h, i) => h === idx.includes(i));

export const STEPS = [
  { text: '안녕, 모험가! 나는 길잡이 요정 루루야.\n직접 한 판 굴려 보면서 규칙을 알려 줄게.', next: '좋아!' },
  { target: '[data-act=roll]', allow: ['roll'], text: '먼저 굴리기 버튼을 눌러 주사위를 던져 봐!',
    done: s => s.rolled },
  { target: '#tray', allow: ['die'], text: '6이 세 개 나왔어! 6이 나온 주사위 세 개를 눌러서 잡아 둬.\n잡은 주사위는 황금빛으로 빛나.',
    tap: s => [0, 1, 3].filter(i => !s.held[i]).map(die => ({ die })),
    done: s => heldExactly(s, [0, 1, 3]) },
  { target: '[data-act=roll]', allow: ['roll'], text: '좋아! 잡은 건 그대로 두고 나머지만 다시 굴려.\n한 턴에 최대 세 번까지 굴릴 수 있어. 남은 횟수는 버튼에 적혀 있어.',
    done: s => s.rollsLeft === 1 },
  { target: '#quests', text: '6이 네 개! 위쪽 의뢰 게시판을 봐.\n조건을 맞춘 의뢰가 반짝이지? 점수를 적으면 같이 해결돼.\n어려운 의뢰일수록 뒤집기·조정을 많이 줘. 먼저 깬 사람 몫이야.', next: '알겠어' },
  { target: '[data-cat=four]', allow: ['score'], only: { cat: 'four' }, text: '족보가 완성되면 점수표가 저절로 떠!\n포카인드를 눌러 기록해. 적은 점수만큼 경험치도 들어오고,\n주사위가 에너지로 뭉쳐 날아가.',
    done: s => s.players[0].scores.four !== null },
  { target: '.cards', allow: ['perk'], text: '레벨 업! 카드 중 하나를 골라.\n고른 특성은 게임 끝까지 영구히 적용돼. 테두리 색이 등급이야.',
    done: s => s.phase === 'roll' && s.round === 2,
    after: s => { s.players[0].flip += 1; s.players[0].nudge += 1; } },
  { target: ['[data-tool=flip]', '[data-tool=nudge]'], gift: true, tap: () => [],
    text: '라운드마다 모두에게 적용되는 이벤트가 바뀌어.\n그리고 요정의 선물! 뒤집기 +1 · 조정 +1 을 줄게.\n반짝이는 두 버튼에 쌓였어. 숫자는 가진 개수 / 최대 3개야.', next: '고마워!' },
  // 흔들어 굴리기를 쓸 수 있는 폰이면 흔들어서 굴려 보게 한다 (버튼도 그대로 된다)
  { target: '[data-act=roll]', allow: ['roll'], shake: true, text: '2라운드야. 굴려 봐!',
    shakeText: '2라운드야! 이번엔 폰을 흔들어서 굴려 볼까?\n흔드는 동안 주사위가 통 안에서 데굴데굴 구르고,\n흔들기를 멈추면 그 자리에서 결과가 나와.\n(굴리기 버튼을 눌러도 돼)',
    done: s => s.rolled },
  { target: '[data-tool=flip]', toolTarget: '#tray', allow: ['tool', 'die'], only: { tool: 'flip', die: 0 },
    tap: (s, tool) => (tool ? ['.flip-tag[data-i="0"]'] : ['[data-tool=flip]']),
    text: '1은 뒤집으면 6이 돼 (마주 보는 면의 합은 7).\n뒤집기를 누르면 주사위마다 뒤집힌 눈이 보여.\n맨 왼쪽 주사위를 눌러 뒤집어!',
    done: s => s.dice[0] === 6 },
  { target: '[data-tool=nudge]', toolTarget: '#tray', allow: ['tool', 'nudge'], only: { tool: 'nudge', die: 4, d: 1 },
    tap: (s, tool) => (tool ? ['[data-act=nudge][data-i="4"][data-d="1"]'] : ['[data-tool=nudge]']),
    text: '이번엔 조정! 조정을 누르면 주사위마다 −1 · +1 버튼이 떠.\n맨 오른쪽 1 위의 +1 을 눌러 2로 만들어.',
    done: s => s.dice[4] === 2 },
  { target: '[data-cat=lstr]', allow: ['score'], only: { cat: 'lstr' }, text: '2·3·4·5·6, 라지 스트레이트 완성!\n점수표가 떴지? 30점을 적어.\n(족보 완성 버튼으로 언제든 점수표를 열 수 있어)',
    done: s => s.players[0].scores.lstr !== null },
  { text: '이게 전부야!\n12라운드 동안 점수표를 채우고, 의뢰로 뒤집기·조정을 모으고,\n레벨업 카드로 나만의 영웅을 키워.\n최종 점수가 가장 높은 영웅이 승리!', next: '실전 시작', end: true },
];
