// Design Ref: §7 보안 — 로그인하지 않은 사람은 로그인 화면으로 보낸다 (빠른 1차 확인).
// 이 확인은 편의용이다. 진짜 권한 확인은 각 페이지의 requireRole과 DB 접근 제한(RLS)이 맡는다.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "./env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabasePublicEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // 로그인 정보를 확인하고 만료가 가까우면 갱신한다
  const { data } = await supabase.auth.getClaims();
  const isLoginPage = request.nextUrl.pathname.startsWith("/login");

  if (!data?.claims && !isLoginPage) {
    // API 요청에는 로그인 화면 대신 401 응답을 돌려준다 (화면 코드가 읽을 수 있게)
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "로그인이 필요해요." } },
        { status: 401 },
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
