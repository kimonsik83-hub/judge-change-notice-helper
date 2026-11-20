"use client";

// Design Ref: §2.2 — 진행 조건 확인(중복·미제출 경고) 후 통지서를 만들어 내려받는다.
// Plan: 작업 9번(진행 선택) + 10번(통지서 작성·내려받기). 작성하면 그 회차는 잠긴다.
// 서버(/api/collect/notice)가 조건을 다시 확인하므로, 이 화면의 확인은 안내용이다.

import { useRouter } from "next/navigation";
import { useState } from "react";

type Phase =
  | { status: "idle" }
  | { status: "confirm" }
  | { status: "working" }
  | { status: "error"; message: string }
  | { status: "done"; count: number; review: number; justLocked: boolean; fileName: string };

/** 응답 헤더의 파일 이름(filename*=UTF-8''...)을 읽는다. 못 읽으면 기본 이름 */
function fileNameFrom(header: string | null): string {
  const match = header?.match(/filename\*=UTF-8''([^;]+)/i);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      // 아래 기본 이름 사용
    }
  }
  return "변경통지서.docx";
}

export function ProceedPanel({
  roundId,
  roundOpen,
  submittedCount,
  totalRows,
  unsubmittedNames,
  duplicateCaseCount,
}: {
  roundId: string;
  roundOpen: boolean;
  submittedCount: number;
  totalRows: number;
  unsubmittedNames: readonly string[];
  duplicateCaseCount: number;
}) {
  const router = useRouter();
  const [acceptUnsubmitted, setAcceptUnsubmitted] = useState(false);
  const [phase, setPhase] = useState<Phase>({ status: "idle" });

  // 진행할 수 없는 이유들 (하나라도 있으면 막는다). 이미 잠긴 회차는 "다시 내려받기"만 가능하다.
  const blockers: string[] = [];
  if (submittedCount === 0 || totalRows === 0) blockers.push("제출된 대상이 아직 없어요.");
  if (roundOpen && duplicateCaseCount > 0) {
    blockers.push(`담당자 사이에 겹치는 사건번호가 ${duplicateCaseCount.toLocaleString()}개 있어요. 담당자가 고쳐서 다시 제출해야 해요.`);
  }

  const needsConfirm = roundOpen && unsubmittedNames.length > 0;
  const ready = blockers.length === 0 && (!needsConfirm || acceptUnsubmitted);
  const working = phase.status === "working";

  async function generate() {
    setPhase({ status: "working" });
    try {
      const response = await fetch("/api/collect/notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, acceptUnsubmitted }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        // 건수가 맞지 않아 막힌 경우에는 몇 건이 어긋났는지 함께 보여준다
        const details = json?.error?.details;
        const gap =
          json?.error?.code === "COUNT_MISMATCH" && typeof details?.expected === "number" && typeof details?.actual === "number"
            ? ` (제출 ${details.expected.toLocaleString()}건, 확인된 건수 ${details.actual.toLocaleString()}건)`
            : "";
        setPhase({
          status: "error",
          message:
            (json?.error?.message ??
              (response.status === 401 ? "로그인이 만료됐어요. 다시 로그인해 주세요." : "통지서를 만들지 못했어요. 다시 시도해 주세요.")) + gap,
        });
        router.refresh(); // 회차 상태가 바뀌었을 수 있으니 화면을 새로 불러온다
        return;
      }

      const fileName = fileNameFrom(response.headers.get("Content-Disposition"));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setPhase({
        status: "done",
        count: Number(response.headers.get("X-Notice-Count") ?? 0),
        review: Number(response.headers.get("X-Notice-Review-Count") ?? 0),
        justLocked: response.headers.get("X-Round-Locked") === "just",
        fileName,
      });
      router.refresh(); // 회차가 잠겼다는 표시를 새로 불러온다
    } catch {
      setPhase({ status: "error", message: "서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요." });
    }
  }

  return (
    <section aria-label="통지서 작성 준비" className="flex flex-col gap-3 rounded border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <h2 className="text-base font-semibold">통지서 작성</h2>

      {!roundOpen ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          이 회차는 통지서가 작성되어 잠겨 있어요. 담당자는 더 이상 제출하거나 고칠 수 없고, 같은 통지서를 다시 내려받을 수 있어요.
        </p>
      ) : null}

      {blockers.length > 0 ? (
        <ul role="alert" className="list-disc pl-5 text-red-600">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : null}

      {roundOpen && blockers.length === 0 && needsConfirm ? (
        <div className="flex flex-col gap-2 text-amber-700 dark:text-amber-400">
          <p role="alert">
            아직 제출하지 않은 담당자가 <strong>{unsubmittedNames.length}명</strong> 있어요: {unsubmittedNames.join(", ")}
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={acceptUnsubmitted}
              onChange={(event) => setAcceptUnsubmitted(event.target.checked)}
            />
            미제출 담당자의 대상이 빠진 채로 진행하는 것을 확인했어요
          </label>
        </div>
      ) : null}

      {roundOpen && blockers.length === 0 && !needsConfirm ? (
        <p className="text-green-700">모든 담당자가 제출했고 겹치는 사건번호도 없어요.</p>
      ) : null}

      {phase.status === "confirm" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span>
            통지서를 만들면 <strong>이 회차는 잠겨서</strong> 담당자가 더 이상 제출할 수 없어요. 총{" "}
            <strong>{totalRows.toLocaleString()}건</strong>으로 만들까요?
          </span>
          <button
            type="button"
            onClick={generate}
            className="rounded bg-zinc-900 px-3 py-1.5 text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            작성하기
          </button>
          <button
            type="button"
            onClick={() => setPhase({ status: "idle" })}
            className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700"
          >
            취소
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {roundOpen ? (
            <button
              type="button"
              disabled={!ready || working}
              onClick={() => setPhase({ status: "confirm" })}
              className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {working ? "만드는 중…" : "통지서 작성"}
            </button>
          ) : (
            <button
              type="button"
              disabled={blockers.length > 0 || working}
              onClick={generate}
              className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {working ? "만드는 중…" : "통지서 다시 내려받기"}
            </button>
          )}
          {roundOpen && !ready ? (
            <span className="text-zinc-600 dark:text-zinc-400">위 항목을 해결하면 진행할 수 있어요.</span>
          ) : null}
        </div>
      )}

      {phase.status === "error" ? (
        <p role="alert" className="text-red-600">
          {phase.message}
        </p>
      ) : null}

      {phase.status === "done" ? (
        <div role="status" className="flex flex-col gap-1 text-green-700">
          <p>
            <strong>{phase.count.toLocaleString()}건</strong>으로 통지서를 만들어 내려받았어요. ({phase.fileName})
            {phase.justLocked ? " 이 회차는 이제 잠겼어요." : ""}
          </p>
          {phase.review > 0 ? (
            <p className="text-amber-700 dark:text-amber-400">
              문서에 &quot;확인 필요&quot;로 표시된 칸이 {phase.review.toLocaleString()}개 있어요. 열어서 확인해 주세요.
            </p>
          ) : (
            <p>&quot;확인 필요&quot;로 표시된 칸은 없어요.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
