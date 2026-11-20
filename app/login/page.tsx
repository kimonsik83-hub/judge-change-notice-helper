import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, homePathFor } from "@/lib/auth";
import { LoginForm } from "./login-form";

async function LoginContent() {
  // 이미 로그인했다면 자기 첫 화면으로 보낸다
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user.role));

  return <LoginForm />;
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-xl font-semibold">심판관 변경통지서 작성 도우미</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        계정은 취합 담당자가 등록해 드려요. 이메일과 비밀번호로 로그인하세요.
      </p>
      <Suspense fallback={<p className="text-sm">불러오는 중…</p>}>
        <LoginContent />
      </Suspense>
    </main>
  );
}
