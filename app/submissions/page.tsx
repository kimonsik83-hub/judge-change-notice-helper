import { Suspense } from "react";
import { Header } from "@/app/ui/header";
import { requireRole } from "@/lib/auth";
import { UploadChecker } from "./upload-checker";

// 담당자 전용 화면: 엑셀을 올려 검사 결과를 본다 (PLAN 6번). 값 고치기는 7번, 최종 제출은 8번에서 이어서 만든다.
async function SubmissionsContent() {
  const user = await requireRole("officer");

  return (
    <>
      <Header user={user} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8">
        <section className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold">변경 대상 엑셀 올리기</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            정해진 양식(.xlsx)에 변경 대상을 적어 올리면 빠진 값, 형식 오류, 중복을 찾아 알려줘요.{" "}
            <a href="/api/submissions/template" className="underline underline-offset-4">
              양식 내려받기
            </a>
          </p>
        </section>
        <UploadChecker />
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
