// Design Ref: §7 보안 — 서버에서 로그인한 사람의 권한으로 데이터를 읽고 쓴다 (접근 제한은 DB가 한 번 더 확인).

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "./env";
import { SESSION_COOKIE_OPTIONS } from "./cookie-options";

/** 서버(서버 컴포넌트, 서버 액션)에서 쓰는 Supabase 연결. 로그인 정보는 쿠키에서 읽는다. */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicEnv();

  return createServerClient(url, publishableKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 로그인 갱신은 proxy.ts가 맡으므로 무시해도 된다.
        }
      },
    },
  });
}
