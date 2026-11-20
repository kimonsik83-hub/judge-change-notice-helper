import { Suspense } from "react";
import { Header } from "@/app/ui/header";
import { requireRole } from "@/lib/auth";

// 취합 담당자 전용 화면. 제출 현황과 전체 대상 확인은 PLAN 9번 작업에서 이 자리에 만든다.
async function CollectContent() {
  const user = await requireRole("collector");

  return (
    <>
      <Header user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-lg font-semibold">제출 현황</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          제출 현황과 전체 대상 확인은 다음 작업에서 만들어요. 담당자 계정은 위의 &quot;계정 관리&quot;에서 등록하세요.
        </p>
      </main>
    </>
  );
}

export default function CollectPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">불러오는 중…</p>}>
      <CollectContent />
    </Suspense>
  );
}
