// CHECK.md 남은 항목 F: 로그인 쿠키를 더 안전하게. 이 앱은 브라우저에서 Supabase를 직접 부르지 않고 서버만 쓰므로
// 자바스크립트가 쿠키를 읽을 필요가 없다(httpOnly). 배포(https)에서는 secure, 유지 기간은 7일로 줄인다 (기본은 400일).

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};
