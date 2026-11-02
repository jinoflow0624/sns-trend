import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "trend-analyzer", // 앱인토스 콘솔 등록명과 일치해야 함
  brand: {
    displayName: "트렌드 분석기", // 콘솔 '앱 이름'과 정확히 일치해야 번들 업로드 통과
    primaryColor: "#3182f6", // 토스 블루 (앱 테마와 동일)
    icon: "https://jinoflow0624.github.io/sns-trend/images/icon.png",
  },
  web: {
    host: "localhost",
    port: 5173,
    commands: {
      dev: "vite dev",
      build: "vite build",
    },
  },
  permissions: [],
  outdir: "dist",
});
