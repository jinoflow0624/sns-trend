import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "trend-analyzer", // 앱인토스 콘솔 등록명과 일치해야 함
  brand: {
    displayName: "요즘 뭐가 유행이야?", // 화면에 노출될 앱 이름
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
