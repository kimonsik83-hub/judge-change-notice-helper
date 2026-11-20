"use client";

// Design Ref: §2.2 — "미제출 담당자가 있으면 경고를 보여주고, 취합 담당자가 진행 여부를 고른다."
// Plan: 작업 9번은 여기까지(상태 확인과 진행 선택). 통지서를 실제로 만드는 일은 작업 10번에서 이어서 연결한다.

import { useState } from "react";

export function ProceedPanel({
  roundOpen,
  submittedCount,
  totalRows,
  unsubmittedNames,
  duplicateCaseCount,
}: {
  roundOpen: boolean;
  submittedCount: number;
  totalRows: number;
  unsubmittedNames: readonly string[];
  duplicateCaseCount: number;
}) {
  const [acceptUnsubmitted, setAcceptUnsubmitted] = useState(false);

  // 진행할 수 없는 이유들 (하나라도 있으면 막는다)
  const blockers: string[] = [];
  if (!roundOpen) blockers.push("이 회차는 이미 잠겨 있어요.");
  if (submittedCount === 0 || totalRows === 0) blockers.push("제출된 대상이 아직 없어요.");
  if (duplicateCaseCount > 0) {
    blockers.push(`담당자 사이에 겹치는 사건번호가 ${duplicateCaseCount.toLocaleString()}개 있어요. 담당자가 고쳐서 다시 제출해야 해요.`);
  }

  const needsConfirm = unsubmittedNames.length > 0;
  const ready = blockers.length === 0 && (!needsConfirm || acceptUnsubmitted);

  return (
    <section aria-label="통지서 작성 준비" className="flex flex-col gap-3 rounded border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <h2 className="text-base font-semibold">통지서 작성 준비</h2>

      {blockers.length > 0 ? (
        <ul role="alert" className="list-disc pl-5 text-red-600">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : null}

      {blockers.length === 0 && needsConfirm ? (
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

      {blockers.length === 0 && !needsConfirm ? (
        <p className="text-green-700">모든 담당자가 제출했고 겹치는 사건번호도 없어요.</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled
          className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          통지서 작성
        </button>
        <span className="text-zinc-600 dark:text-zinc-400">
          {ready
            ? "진행할 수 있는 상태예요. 통지서 작성 기능은 다음 작업에서 이 버튼에 연결해요."
            : "위 항목을 해결하면 진행할 수 있어요."}
        </span>
      </div>
    </section>
  );
}
