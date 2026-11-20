import { Suspense } from "react";
import Link from "next/link";
import { Header } from "@/app/ui/header";
import { requireRole } from "@/lib/auth";
import {
  MAX_QUERY_LENGTH,
  PAGE_SIZE,
  getCrossDuplicates,
  getOfficerStatuses,
  getTargetPage,
  getViewRound,
  parsePage,
} from "@/lib/collect";
import { createClient } from "@/lib/supabase/server";
import { ProceedPanel } from "./proceed-panel";
import { RoundForm } from "./round-form";

const dateTimeFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

/** 주소의 값(문자열 또는 문자열 목록)을 문자열 하나로 정리한다 */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// 취합 담당자 전용 화면: 회차 만들기(8번), 제출 현황·전체 대상·담당자 사이 중복 확인(9번).
async function CollectContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole("collector");
  const params = await searchParams;

  // 서로 기다릴 필요 없는 조회는 동시에 한다 (취합 담당자는 접근 제한(RLS) 정책에 따라 모든 회차를 볼 수 있다)
  const supabase = await createClient();
  const [{ data: rounds }, viewRound] = await Promise.all([
    supabase
      .from("rounds")
      .select("id, name, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    getViewRound(),
  ]);
  const openRound = (rounds ?? []).find((round) => round.status === "open");

  // 제출 현황과 담당자 사이 중복
  const [statuses, duplicates] = viewRound
    ? await Promise.all([getOfficerStatuses(viewRound.id), getCrossDuplicates(viewRound.id)])
    : [[], null];
  const submitted = statuses.filter((status) => status.submissionId !== null);
  const unsubmitted = statuses.filter((status) => status.submissionId === null);
  const totalRows = submitted.reduce((sum, status) => sum + status.rowCount, 0);

  // 전체 대상 표의 조건 (주소에서 읽는다. 잘못된 값은 무시한다)
  const officerParam = firstValue(params.officer);
  const selectedOfficer = submitted.find((status) => status.id === officerParam);
  const query = (firstValue(params.q) ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const requestedPage = parsePage(firstValue(params.page));

  const targets = viewRound
    ? await getTargetPage({
        submissionIds: (selectedOfficer ? [selectedOfficer] : submitted).map((status) => status.submissionId as string),
        officerBySubmission: new Map(submitted.map((status) => [status.submissionId as string, status.name])),
        page: requestedPage,
        query,
      })
    : null;

  function hrefForPage(page: number): string {
    const search = new URLSearchParams();
    if (selectedOfficer) search.set("officer", selectedOfficer.id);
    if (query) search.set("q", query);
    if (page > 1) search.set("page", String(page));
    const text = search.toString();
    return text ? `/collect?${text}` : "/collect";
  }

  return (
    <>
      <Header user={user} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8">
        <section className="flex flex-col gap-3">
          <h1 className="text-lg font-semibold">회차</h1>
          {openRound ? (
            <p className="text-sm">
              지금 열려 있는 회차: <strong>{openRound.name}</strong>. 담당자들이 이 회차에 제출할 수 있어요.
            </p>
          ) : (
            <>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                열려 있는 회차가 없어요. 회차를 열면 담당자들이 엑셀을 제출할 수 있어요.
              </p>
              <RoundForm />
            </>
          )}
          {(rounds ?? []).length > 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              지난 회차: {(rounds ?? []).map((round) => `${round.name}(${round.status === "open" ? "열림" : "잠김"})`).join(", ")}
            </p>
          ) : null}
        </section>

        {!viewRound ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">회차를 열면 이곳에 제출 현황이 나와요.</p>
        ) : (
          <>
            <section aria-label="제출 현황" className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">
                제출 현황 · {viewRound.name}
                {viewRound.status === "locked" ? " (잠김)" : ""}
              </h2>
              <p className="text-sm">
                제출 <strong>{submitted.length}</strong>/{statuses.length}명 · 총 <strong>{totalRows.toLocaleString()}</strong>건
              </p>
              {statuses.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  등록된 담당자가 없어요. 위쪽 &quot;계정 관리&quot;에서 담당자를 등록하세요.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="py-2 pr-3">담당자</th>
                      <th className="py-2 pr-3">상태</th>
                      <th className="py-2 pr-3">건수</th>
                      <th className="py-2">제출 시각</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statuses.map((status) => (
                      <tr key={status.id} className="border-b border-zinc-100 dark:border-zinc-900">
                        <td className="py-2 pr-3">{status.name}</td>
                        <td className="py-2 pr-3">
                          {status.submissionId ? (
                            <span className="text-green-700">제출됨</span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">미제출</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{status.submissionId ? status.rowCount.toLocaleString() : "-"}</td>
                        <td className="py-2">
                          {status.submittedAt ? dateTimeFormat.format(new Date(status.submittedAt)) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <ProceedPanel
              roundId={viewRound.id}
              roundOpen={viewRound.status === "open"}
              submittedCount={submitted.length}
              totalRows={totalRows}
              unsubmittedNames={unsubmitted.map((status) => status.name)}
              duplicateCaseCount={duplicates?.caseCount ?? 0}
            />

            {duplicates && duplicates.caseCount > 0 ? (
              <section aria-label="담당자 사이 중복" className="flex flex-col gap-3">
                <h2 className="text-base font-semibold">담당자 사이 중복 사건번호 {duplicates.caseCount.toLocaleString()}개</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  서로 다른 담당자가 같은 사건번호를 올렸어요. 해당 담당자에게 알려 고친 뒤 다시 제출하도록 해 주세요(다시 제출하면 덮어써요).
                </p>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="py-2 pr-3">사건번호</th>
                      <th className="py-2 pr-3">담당자</th>
                      <th className="py-2">엑셀 행</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicates.rows.slice(0, 200).map((row, index) => (
                      <tr key={`${row.caseNumber}-${row.officerName}-${row.rowNumber}-${index}`} className="border-b border-zinc-100 dark:border-zinc-900">
                        <td className="py-2 pr-3">{row.caseNumber}</td>
                        <td className="py-2 pr-3">{row.officerName}</td>
                        <td className="py-2">{row.rowNumber}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {duplicates.rows.length > 200 || duplicates.truncated ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    앞부분만 보여줘요. 위쪽을 해결하면 이어서 나와요.
                  </p>
                ) : null}
              </section>
            ) : null}

            <section aria-label="전체 대상" className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">전체 대상</h2>
              <form action="/collect" method="get" className="flex flex-wrap items-end gap-3 text-sm">
                <label className="flex flex-col gap-1">
                  담당자
                  <select
                    name="officer"
                    defaultValue={selectedOfficer?.id ?? ""}
                    className="rounded border border-zinc-300 px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="">전체</option>
                    {submitted.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  사건번호 검색
                  <input
                    name="q"
                    defaultValue={query}
                    maxLength={MAX_QUERY_LENGTH}
                    placeholder="일부만 입력해도 돼요"
                    className="w-56 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
                <button type="submit" className="rounded bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">
                  찾기
                </button>
                {selectedOfficer || query ? (
                  <Link href="/collect" className="py-2 underline underline-offset-4">
                    조건 지우기
                  </Link>
                ) : null}
              </form>

              {targets && targets.total === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {query || selectedOfficer ? "조건에 맞는 대상이 없어요." : "제출된 대상이 아직 없어요."}
                </p>
              ) : targets ? (
                <>
                  <p className="text-sm">
                    {targets.total.toLocaleString()}건 중 {((targets.page - 1) * PAGE_SIZE + 1).toLocaleString()}–
                    {Math.min(targets.page * PAGE_SIZE, targets.total).toLocaleString()}번째 ({targets.page}/{targets.totalPages}쪽)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-zinc-800">
                          {["담당자", "행", "사건번호", "통지여부", "기존 심판부", "변경 심판부", "기존 심판관", "변경 심판관", "조사관", "회의(1차)", "회의(2차)", "회의(3차)", "보류", "의결"].map((label) => (
                            <th key={label} className="py-2 pr-3">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {targets.rows.map((row, index) => (
                          <tr key={`${row.officerName}-${row.rowNumber}-${index}`} className="border-b border-zinc-100 dark:border-zinc-900">
                            <td className="py-1.5 pr-3">{row.officerName}</td>
                            <td className="py-1.5 pr-3">{row.rowNumber}</td>
                            <td className="py-1.5 pr-3">{row.caseNumber}</td>
                            <td className="py-1.5 pr-3">{row.noticeFlag}</td>
                            <td className="py-1.5 pr-3">{row.oldPanel}</td>
                            <td className="py-1.5 pr-3">{row.newPanel}</td>
                            <td className="py-1.5 pr-3">{row.oldJudge}</td>
                            <td className="py-1.5 pr-3">{row.newJudge}</td>
                            <td className="py-1.5 pr-3">{row.investigator}</td>
                            <td className="py-1.5 pr-3">{row.meeting1}</td>
                            <td className="py-1.5 pr-3">{row.meeting2}</td>
                            <td className="py-1.5 pr-3">{row.meeting3}</td>
                            <td className="py-1.5 pr-3">{row.onHold}</td>
                            <td className="py-1.5 pr-3">{row.decision}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <nav aria-label="쪽 이동" className="flex items-center gap-4 text-sm">
                    {targets.page > 1 ? (
                      <Link href={hrefForPage(targets.page - 1)} className="underline underline-offset-4">
                        ← 이전
                      </Link>
                    ) : (
                      <span className="text-zinc-400">← 이전</span>
                    )}
                    <span>
                      {targets.page} / {targets.totalPages}
                    </span>
                    {targets.page < targets.totalPages ? (
                      <Link href={hrefForPage(targets.page + 1)} className="underline underline-offset-4">
                        다음 →
                      </Link>
                    ) : (
                      <span className="text-zinc-400">다음 →</span>
                    )}
                  </nav>
                </>
              ) : null}
            </section>
          </>
        )}
      </main>
    </>
  );
}

export default function CollectPage({ searchParams }: PageProps<"/collect">) {
  return (
    <Suspense fallback={<p className="p-4 text-sm">불러오는 중…</p>}>
      <CollectContent searchParams={searchParams} />
    </Suspense>
  );
}
