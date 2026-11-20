// Design Ref: §4.3 — 서버 전용 비밀 키(SUPABASE_SECRET_KEY)로 접근 제한을 건너뛰는 연결.
// 계정 만들기처럼 정책이 없는 일에만 쓰고, 호출하기 전에 반드시 역할을 먼저 확인한다.
// 이 파일은 서버 코드에서만 가져올 수 있다 (브라우저 코드에서 가져오면 빌드가 실패한다).

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env";

export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(".env에 SUPABASE_SECRET_KEY가 없어요.");
  }
  const { url } = getSupabasePublicEnv();

  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
