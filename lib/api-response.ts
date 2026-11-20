// Design Ref: §6.2 오류 응답 형식 — 모든 API가 같은 모양으로 오류를 돌려준다.

import { NextResponse } from "next/server";

/**
 * 브라우저가 다른 사이트에서 보낸 요청인지 확인한다 (CHECK.md F). Origin 헤더가 있는데 이 사이트와 다르면 거절 대상이다.
 * 서버끼리 보내는 요청처럼 Origin이 없는 경우는 통과시킨다 (로그인 쿠키 확인은 따로 한다).
 */
export function isCrossSiteRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/** 오류 응답: { error: { code, message, details? } } */
export function apiError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}
