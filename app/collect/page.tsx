import { Suspense } from "react";
import { Header } from "@/app/ui/header";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RoundForm } from "./round-form";

// 취합 담당자 전용 화면. 회차 만들기(PLAN 8번에 필요한 최소 기능)와, 제출 현황·전체 대상 확인(PLAN 9번)이 들어갈 자리.
async function CollectContent() {
  const user = await requireRole("collector");

  // 취합 담당자는 접근 제한(RLS) 정책에 따라 모든 회차를 볼 수 있다
  const supabase = await createClient();
  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, name, status, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  const openRound = (rounds ?? []).find((round) => round.status === "open");

  return (
    <>
      <Header user={user} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8">
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
        </section>

        {(rounds ?? []).length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">회차 목록</h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="py-2">이름</th>
                  <th className="py-2">상태</th>
                </tr>
              </thead>
              <tbody>
                {(rounds ?? []).map((round) => (
                  <tr key={round.id} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-2">{round.name}</td>
                    <td className="py-2">{round.status === "open" ? "열림" : "잠김"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
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
