import { Suspense } from "react";
import { Header } from "@/app/ui/header";
import { requireRole } from "@/lib/auth";
import { getMySubmission, getOpenRound } from "@/lib/rounds";
import { UploadChecker } from "./upload-checker";

const dateTimeFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

// 담당자 전용 화면: 엑셀을 올려 검사하고(6번), 값을 고치고(7번), 열린 회차에 최종 제출한다(8번).
async function SubmissionsContent() {
  const user = await requireRole("officer");
  const round = await getOpenRound();
  const existing = round ? await getMySubmission(round.id, user.id) : null;

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

        <section aria-label="제출할 회차" className="rounded border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
          {!round ? (
            <p>지금 열려 있는 회차가 없어요. 취합 담당자가 회차를 열면 제출할 수 있어요. (검사는 지금도 해 볼 수 있어요.)</p>
          ) : existing ? (
            <p>
              제출할 회차: <strong>{round.name}</strong> · 이미 <strong>{existing.rowCount.toLocaleString()}건</strong>을 제출했어요
              {existing.submittedAt ? ` (${dateTimeFormat.format(new Date(existing.submittedAt))})` : ""}. 다시 제출하면 덮어써요.
            </p>
          ) : (
            <p>
              제출할 회차: <strong>{round.name}</strong> · 아직 제출하지 않았어요.
            </p>
          )}
        </section>

        <UploadChecker round={round} />
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
