import { Suspense } from "react";
import { Header } from "@/app/ui/header";
import { requireRole } from "@/lib/auth";

// 담당자 전용 화면. 업로드·검사 화면은 PLAN 6번 작업에서 이 자리에 만든다.
async function SubmissionsContent() {
  const user = await requireRole("officer");

  return (
    <>
      <Header user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-lg font-semibold">내 제출</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          엑셀 업로드와 검사 화면은 다음 작업에서 만들어요.
        </p>
      </main>
    </>
  );
}

export default function SubmissionsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">불러오는 중…</p>}>
      <SubmissionsContent />
    </Suspense>
  );
}
