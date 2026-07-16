#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
insta_collect.py — 인스타그램 트렌드 신호 수집기 (세션 유지 프로필 방식)
=============================================================
비밀번호를 저장하지 않는다. 대신 전용 브라우저 프로필(.profile/)에
사용자가 딱 한 번 직접 로그인해두면, 이후 실행은 그 세션을 재사용한다.

사용법:
  1) 최초 1회 — 로그인 (창이 뜨면 직접 인스타그램 로그인 후 창 닫기):
       python insta_collect.py --login
  2) 이후 — 수집 (헤드리스, hashtags.txt의 해시태그를 순회):
       python insta_collect.py
     결과: out/collect_YYYYMMDD_HHMM.json

수집 항목 (해시태그당):
  - 상위 게시물의 캡션/대체텍스트/링크 (트렌드 판단용 원자료)
  - 페이지 로드 성공 여부

주의:
  - 인스타그램 자동화는 약관상 제한 대상. 수집 빈도를 낮게 유지할 것
    (하루 1~2회 권장, 6시간마다 돌리는 파이프라인에서는 인스타는 하루 2회만 참여).
  - 본계정 대신 수집 전용 서브계정 사용을 강력 권장.
  - 요청 간 무작위 대기(4~9초)로 봇 패턴을 피한다.
"""
import io, os, sys, json, time, random, re
from datetime import datetime
from playwright.sync_api import sync_playwright

# Windows 콘솔(cp949)에서 유니코드 출력 깨짐 방지
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = os.path.dirname(os.path.abspath(__file__))
PROFILE_DIR = os.path.join(BASE, ".profile")
OUT_DIR = os.path.join(BASE, "out")
HASHTAG_FILE = os.path.join(BASE, "hashtags.txt")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")


def read_hashtags():
    tags = []
    if os.path.exists(HASHTAG_FILE):
        for line in io.open(HASHTAG_FILE, encoding="utf-8"):
            line = line.strip().lstrip("#")
            if line and not line.startswith("//"):
                tags.append(line)
    return tags or ["프리티걸챌린지", "끄네끼", "장마"]


def do_login():
    """창을 띄우고 사용자가 직접 로그인하게 한다. 비밀번호는 저장되지 않고
    세션 쿠키만 .profile/ 에 남는다."""
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            PROFILE_DIR, headless=False, user_agent=UA,
            viewport={"width": 480, "height": 900})
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto("https://www.instagram.com/", timeout=60000)
        print("=" * 60)
        print("브라우저 창에서 인스타그램에 직접 로그인하세요.")
        print("로그인이 감지되면 자동으로 저장하고 닫힙니다 (최대 5분 대기).")
        print("=" * 60)
        ok = False
        for _ in range(60):  # 5초 × 60 = 최대 5분
            time.sleep(5)
            try:
                if any(c.get("name") == "sessionid" and c.get("value")
                       for c in ctx.cookies()):
                    ok = True
                    break
            except Exception:
                break
        ctx.close()
    if ok:
        print(f"로그인 감지 — 세션 저장 완료: {PROFILE_DIR}")
    else:
        print("[!] 로그인이 감지되지 않았습니다. 다시 실행해 주세요.")
        sys.exit(1)


def collect():
    tags = read_hashtags()
    os.makedirs(OUT_DIR, exist_ok=True)
    result = {"collectedAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
              "source": "instagram", "hashtags": {}}

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            PROFILE_DIR, headless=True, user_agent=UA,
            viewport={"width": 480, "height": 900})
        page = ctx.pages[0] if ctx.pages else ctx.new_page()

        # 로그인 상태 확인
        page.goto("https://www.instagram.com/", timeout=60000)
        page.wait_for_timeout(4000)
        if "/accounts/login" in page.url or "loginForm" in page.content():
            ctx.close()
            print("[!] 세션이 만료됐습니다. 먼저 실행하세요: python insta_collect.py --login")
            sys.exit(1)

        for tag in tags:
            entry = {"ok": False, "posts": []}
            try:
                page.goto(f"https://www.instagram.com/explore/search/keyword/?q=%23{tag}",
                          timeout=60000)
                page.wait_for_timeout(5000)
                # 게시물 링크 + 이미지 대체텍스트(캡션 요약이 들어있음) 추출
                items = page.eval_on_selector_all(
                    "a[href*='/reel/'], a[href*='/p/']",
                    """els => els.slice(0, 12).map(a => {
                        const img = a.querySelector('img');
                        return { href: a.getAttribute('href'),
                                 alt: img ? (img.getAttribute('alt') || '') : '' };
                    })""")
                entry["posts"] = items
                entry["ok"] = len(items) > 0
                print(f"#{tag}: {len(items)}개 수집")
            except Exception as e:
                entry["error"] = str(e)[:200]
                print(f"#{tag}: 실패 — {e}")
            result["hashtags"][tag] = entry
            time.sleep(random.uniform(4, 9))  # 봇 패턴 방지 무작위 대기

        ctx.close()

    out_path = os.path.join(
        OUT_DIR, "collect_" + datetime.now().strftime("%Y%m%d_%H%M") + ".json")
    io.open(out_path, "w", encoding="utf-8").write(
        json.dumps(result, ensure_ascii=False, indent=2))
    print(f"저장: {out_path}")
    return out_path


if __name__ == "__main__":
    if "--login" in sys.argv:
        do_login()
    else:
        collect()
