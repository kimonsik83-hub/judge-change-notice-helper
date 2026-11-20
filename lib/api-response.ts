// Design Ref: §6.2 오류 응답 형식 — 모든 API가 같은 모양으로 오류를 돌려준다.

import { NextResponse } from "next/server";

/** 오류 응답: { error: { code, message, details? } } */
export function apiError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}
