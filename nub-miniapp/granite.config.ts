import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  // ⚠️ 아래 appName / displayName 은 앱인토스 콘솔에 "새 앱"으로 등록한 값과
  //    정확히 일치해야 번들 업로드가 통과돼요. (SNS 트렌드 앱과는 별개의 새 앱)
  appName: "samsinhalmae", // 콘솔 등록명(appName)과 일치
  brand: {
    displayName: "내 아이는 여자? 남자?", // 콘솔 '앱 이름'과 정확히 일치 (번들 업로드 검증용)
    primaryColor: "#4E7CB4", // 앱 테마 바이올렛
    // 앱 로고: nub-miniapp/public/icon.png (600x600). 콘솔 앱 등록 시 업로드하고,
    // 아래엔 그 로고가 호스팅된 공개 URL을 넣어요.
    icon: "https://TODO.example.com/samsinhalmae-icon.png",
  },
  web: {
    host: "localhost",
    port: 5174, // SNS 앱(5173)과 겹치지 않게 다른 포트
    commands: {
      dev: "vite dev",
      build: "vite build",
    },
  },
  // 사진은 <input type="file">(웹뷰 기본 파일 선택)로 받으므로 별도 권한이 필요 없어요.
  permissions: [],
  outdir: "dist",
});
