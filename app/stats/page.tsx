import { Suspense } from "react";
import { Header } from "@/app/ui/header";
import { requireRole } from "@/lib/auth";
import { getViewRound } from "@/lib/collect";
import { getRoundStats } from "@/lib/stats";

// Design Ref: §1.1 화면 목록 — /stats 통계 (nice, 취합 담당자 전용)
// Plan: 작업 12번. 담당자별로 처음 업로드 때 오류가 있던 행 수와 고친 칸 수를 보여준다.

function percent(part: number, whole: number): string {
  return whole === 0 ? "-" : `${((part / whole) * 100).toFixed(1)}%`;
}

async function StatsContent() {
  const user = await requireRole("collector");
  const round = await getViewRound();
  const stats = round ? await getRoundStats(round.id) : null;

  return (
    <>
      <Header user={user} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-8">
        <h1 className="text-lg font-semibold">오류 통계{round ? ` · ${round.name}` : ""}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          담당자가 처음 올린 엑셀에서 오류가 있던 행 수와, 제출 전에 고친 칸 수예요. 제출 이후의 값만 통지서에 들어가요.
        </p>

        {!stats ? (
          <p className="text-sm">회차가 아직 없어요.</p>
        ) : stats.officers.length === 0 ? (
          <p className="text-sm">등록된 담당자가 없어요.</p>
        ) : (
          <>
            <p className="text-sm">
              제출된 {stats.totalRows.toLocaleString()}건 중 처음 오류가 있던 행 <strong>{stats.totalErrorRows.toLocaleString()}</strong>개(
              {percent(stats.totalErrorRows, stats.totalRows)}), 제출 전에 고친 칸 <strong>{stats.totalEditedCells.toLocaleString()}</strong>개
            </p>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  {["담당자", "상태", "제출 건수", "처음 오류 행", "오류 비율", "고친 칸"].map((label) => (
                    <th key={label} className="py-2 pr-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.officers.map((o) => (
                  <tr key={o.name} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-2 pr-3">{o.name}</td>
                    <td className="py-2 pr-3">{o.submitted ? "제출됨" : "미제출"}</td>
                    <td className="py-2 pr-3">{o.submitted ? o.rowCount.toLocaleString() : "-"}</td>
                    <td className="py-2 pr-3">{o.submitted ? o.initialErrorRows.toLocaleString() : "-"}</td>
                    <td className="py-2 pr-3">{o.submitted ? percent(o.initialErrorRows, o.rowCount) : "-"}</td>
                    <td className="py-2 pr-3">{o.submitted ? o.editedCells.toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </main>
    </>
  );
}

export default function StatsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">불러오는 중…</p>}>
      <StatsContent />
    </Suspense>
  );
}
