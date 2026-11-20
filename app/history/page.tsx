import { Suspense } from "react";
import Link from "next/link";
import { Header } from "@/app/ui/header";
import { requireRole } from "@/lib/auth";
import { getViewRound, parsePage } from "@/lib/collect";
import { HISTORY_PAGE_SIZE, getHistoryPage } from "@/lib/history";

// Design Ref: §1.1 화면 목록 — /history 수정 이력 (nice, 취합 담당자 전용)
// Plan: 작업 11번. 담당자가 업로드 후 값을 고친 기록(누가, 언제, 무엇을 어떻게)을 보여준다.

const dateTimeFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

async function HistoryContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("collector");
  const params = await searchParams;
  const pageParam = Array.isArray(params.page) ? params.page[0] : params.page;

  const round = await getViewRound();
  const history = round ? await getHistoryPage(round.id, parsePage(pageParam)) : null;

  return (
    <>
      <Header user={user} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-8">
        <h1 className="text-lg font-semibold">수정 이력{round ? ` · ${round.name}` : ""}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          담당자가 엑셀을 올린 뒤 값을 고쳐서 제출한 기록이에요. 다시 제출하면 그 담당자의 이전 기록은 새 기록으로 바뀌어요.
        </p>

        {!history || history.total === 0 ? (
          <p className="text-sm">{round ? "이 회차에는 고친 기록이 없어요." : "회차가 아직 없어요."}</p>
        ) : (
          <>
            <p className="text-sm">
              총 {history.total.toLocaleString()}건 ({history.page}/{history.totalPages}쪽)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    {["시각", "담당자", "엑셀 행", "사건번호", "열", "이전 값", "새 값"].map((label) => (
                      <th key={label} className="py-2 pr-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-zinc-100 dark:border-zinc-900">
                      <td className="py-1.5 pr-3">{dateTimeFormat.format(new Date(entry.editedAt))}</td>
                      <td className="py-1.5 pr-3">{entry.officerName}</td>
                      <td className="py-1.5 pr-3">{entry.rowNumber}</td>
                      <td className="py-1.5 pr-3">{entry.caseNumber}</td>
                      <td className="py-1.5 pr-3">{entry.columnLabel}</td>
                      <td className="py-1.5 pr-3">{entry.oldValue === "" ? "(비어 있음)" : entry.oldValue}</td>
                      <td className="py-1.5 pr-3">{entry.newValue === "" ? "(비어 있음)" : entry.newValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav aria-label="쪽 이동" className="flex items-center gap-4 text-sm">
              {history.page > 1 ? (
                <Link href={`/history?page=${history.page - 1}`} className="underline underline-offset-4">
                  ← 이전
                </Link>
              ) : (
                <span className="text-zinc-400">← 이전</span>
              )}
              <span>
                {history.page} / {history.totalPages} (쪽당 {HISTORY_PAGE_SIZE}건)
              </span>
              {history.page < history.totalPages ? (
                <Link href={`/history?page=${history.page + 1}`} className="underline underline-offset-4">
                  다음 →
                </Link>
              ) : (
                <span className="text-zinc-400">다음 →</span>
              )}
            </nav>
          </>
        )}
      </main>
    </>
  );
}

export default function HistoryPage({ searchParams }: PageProps<"/history">) {
  return (
    <Suspense fallback={<p className="p-4 text-sm">불러오는 중…</p>}>
      <HistoryContent searchParams={searchParams} />
    </Suspense>
  );
}
