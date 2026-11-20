import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 자동 시험 설정 (CHECK.md 1순위). 화면과 분리된 순수 함수(lib/)를 시험한다.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30000 },
});
