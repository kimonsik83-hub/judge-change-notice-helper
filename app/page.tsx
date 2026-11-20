import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, homePathFor } from "@/lib/auth";

// 첫 주소(/)는 화면이 없다. 로그인했으면 역할별 첫 화면으로, 아니면 로그인 화면으로 보낸다.
// 로그인 정보(쿠키)는 요청 때 읽어야 하므로 Suspense 안에서 확인한다 (Cache Components 규칙).
async function Redirector() {
  const user = await getCurrentUser();
  return redirect(user ? homePathFor(user.role) : "/login");
}

export default function Home() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">불러오는 중…</p>}>
      <Redirector />
    </Suspense>
  );
}
