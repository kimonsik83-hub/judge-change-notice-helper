// Design Ref: §4.3 비밀 값 관리 — 접속 값은 .env에서만 읽고 코드에 직접 쓰지 않는다.

/**
 * 브라우저에 공개돼도 되는 접속 값(주소, 공개 키)을 읽는다.
 * NEXT_PUBLIC_ 값은 Next.js가 빌드 때 글자 그대로 바꿔 넣으므로 이름을 직접 적어야 한다.
 */
export function getSupabasePublicEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      ".env에 NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY가 없어요.",
    );
  }
  return { url, publishableKey };
}
