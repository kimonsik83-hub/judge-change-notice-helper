// Design Ref: §7 보안 — Next.js 16에서는 middleware 대신 proxy.ts를 쓴다.
// 모든 화면 요청 앞에서 로그인 여부를 확인하고 로그인 정보를 갱신한다.

import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // 이미지, 정적 파일, 아이콘은 확인하지 않는다
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
