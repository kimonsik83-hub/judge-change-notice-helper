"use client";

// Design Ref: §1.2 담당자 — 업로드·검사 화면. ① 엑셀 올리기 ② 검사 결과 (요약 + 오류 표 + 값 고치기).
// Plan: 작업 6번(업로드·검사) + 7번(값을 고치면 바로 다시 검사). 최종 제출은 8번에서 이 화면에 이어서 만든다.

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { applyEdit, countEdits, diffEdits, rowIndexOf } from "@/lib/edits";
import { COLUMNS, type ColumnKey, type NoticeRow } from "@/lib/schema";
import { validateRows, type Issue, type IssueType } from "@/lib/validate";

/** 지금 제출할 수 있는 열린 회차 */
interface RoundInfo {
  id: string;
  name: string;
}

type SubmitState =
  | { status: "idle" }
  | { status: "confirm" }
  | { status: "sending" }
  | { status: "error"; message: string }
  | { status: "done"; rows: readonly NoticeRow[]; rowCount: number; roundName: string; overwritten: boolean };

/** 서버가 처음 검사해서 돌려준 결과 */
interface UploadedData {
  fileName: string;
  rows: NoticeRow[];
  unknownHeaders: string[];
  result: { errorRowCount: number };
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; data: UploadedData; version: number };

const COLUMN_LABEL: Record<string, string> = Object.fromEntries(
  COLUMNS.map((column) => [column.key, column.label]),
);

const TYPE_LABEL: Record<IssueType, string> = {
  missingRequired: "필수 누락",
  invalidFormat: "형식 오류",
  duplicate: "중복",
};

/** 표에 한 번에 그리는 최대 줄 수. 수천 건이 한꺼번에 그려져 느려지는 것을 막는다. */
const MAX_VISIBLE_ISSUES = 300;

export function UploadChecker({ round }: { round: RoundInfo | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadCount = useRef(0);
  const [state, setState] = useState<State>({ status: "idle" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setState({ status: "error", message: "엑셀 파일을 먼저 선택해 주세요." });
      return;
    }

    setState({ status: "loading" });
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/submissions/validate", { method: "POST", body });
      const json = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          json?.error?.message ??
          (response.status === 401 ? "로그인이 만료됐어요. 다시 로그인해 주세요." : "검사하지 못했어요. 다시 시도해 주세요.");
        setState({ status: "error", message });
        return;
      }
      uploadCount.current += 1;
      setState({ status: "done", data: json.data as UploadedData, version: uploadCount.current });
    } catch {
      setState({ status: "error", message: "서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요." });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="엑셀 파일 선택"
          className="text-sm"
        />
        <button
          type="submit"
          disabled={state.status === "loading"}
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {state.status === "loading" ? "검사 중…" : "검사하기"}
        </button>
      </form>

      {state.status === "error" ? (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      ) : null}

      {/* 올릴 때마다 번호가 바뀌어 고친 내용이 새 파일과 섞이지 않고 처음부터 다시 시작한다 */}
      {state.status === "done" ? <Result key={state.version} data={state.data} round={round} /> : null}
    </div>
  );
}

function Result({ data, round }: { data: UploadedData; round: RoundInfo | null }) {
  const router = useRouter();
  // 업로드한 원본은 그대로 두고, 고친 값은 rows(복사본)에만 반영한다
  const [rows, setRows] = useState<readonly NoticeRow[]>(data.rows);
  const [filter, setFilter] = useState<IssueType | "all">("all");
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  // 제출한 뒤 값을 또 고쳤다면 "제출했어요" 표시는 더 이상 맞지 않으므로 숨긴다
  const submitted = submit.status === "done" && submit.rows === rows ? submit : null;

  async function sendSubmission() {
    setSubmit({ status: "sending" });
    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 처음 오류 행 수는 통계용이다. 서버가 오류 0건인지 다시 검사한다.
        body: JSON.stringify({
          rows,
          initialErrorCount: data.result.errorRowCount,
          // 수정 이력: 원본과 달라진 칸만 보낸다 (새 값은 서버가 제출한 행에서 읽는다)
          edits: diffEdits(data.rows, rows),
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          json?.error?.message ??
          (response.status === 401 ? "로그인이 만료됐어요. 다시 로그인해 주세요." : "제출하지 못했어요. 다시 시도해 주세요.");
        setSubmit({ status: "error", message });
        return;
      }
      setSubmit({
        status: "done",
        rows,
        rowCount: json.data.rowCount as number,
        roundName: json.data.roundName as string,
        overwritten: json.data.overwritten as boolean,
      });
      router.refresh(); // 위쪽 "이미 제출했어요" 안내를 새로 불러온다
    } catch {
      setSubmit({ status: "error", message: "서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요." });
    }
  }

  // 값이 바뀔 때마다 서버와 똑같은 검사 규칙으로 바로 다시 검사한다
  const result = useMemo(() => validateRows(rows), [rows]);
  const editCount = useMemo(() => countEdits(data.rows, rows), [data.rows, rows]);

  const visible: Issue[] =
    filter === "all" ? [...result.issues] : result.issues.filter((issue) => issue.type === filter);
  const shown = visible.slice(0, MAX_VISIBLE_ISSUES);

  function commit(issue: Issue, value: string) {
    setRows((current) => applyEdit(current, issue.row, issue.column, value));
  }

  return (
    <section aria-label="검사 결과" className="flex flex-col gap-4">
      <p className="text-sm" aria-live="polite">
        <strong>{data.fileName}</strong> · 전체 <strong>{result.totalRows.toLocaleString()}</strong>건 · 오류가 있는 행{" "}
        <strong>{result.errorRowCount.toLocaleString()}</strong>개 (필수 누락 {result.missingCount.toLocaleString()} · 형식
        오류 {result.formatCount.toLocaleString()} · 중복 {result.duplicateCount.toLocaleString()})
        {editCount > 0 ? (
          <>
            {" "}
            · 처음 {data.result.errorRowCount.toLocaleString()}개에서 줄었어요 · 고친 칸 {editCount.toLocaleString()}개
          </>
        ) : null}
      </p>

      {data.unknownHeaders.length > 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          양식에 없는 열은 검사하지 않았어요: {data.unknownHeaders.join(", ")}
        </p>
      ) : null}

      {editCount > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setRows(data.rows)}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700"
          >
            고친 내용 모두 되돌리기
          </button>
        </div>
      ) : null}

      {result.issues.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-green-700">오류가 없어요. 제출할 수 있어요.</p>

          {submitted ? (
            <p role="status" className="text-sm text-green-700">
              <strong>{submitted.roundName}</strong> 회차에 {submitted.rowCount.toLocaleString()}건을 제출했어요.
              {submitted.overwritten ? " (이전에 제출한 내용을 덮어썼어요.)" : ""}
            </p>
          ) : !round ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              지금 열려 있는 회차가 없어서 제출할 수 없어요. 취합 담당자가 회차를 열면 제출할 수 있어요.
            </p>
          ) : submit.status === "confirm" ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                <strong>{round.name}</strong> 회차에 {result.totalRows.toLocaleString()}건을 제출할까요? 이미 제출한 내용이
                있으면 덮어써요.
              </span>
              <button
                type="button"
                onClick={sendSubmission}
                className="rounded bg-zinc-900 px-3 py-1.5 text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                제출하기
              </button>
              <button
                type="button"
                onClick={() => setSubmit({ status: "idle" })}
                className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700"
              >
                취소
              </button>
            </div>
          ) : (
            <div>
              <button
                type="button"
                disabled={submit.status === "sending"}
                onClick={() => setSubmit({ status: "confirm" })}
                className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {submit.status === "sending" ? "제출 중…" : "최종 제출"}
              </button>
            </div>
          )}

          {submit.status === "error" ? (
            <p role="alert" className="text-sm text-red-600">
              {submit.message}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-sm" role="group" aria-label="문제 종류 보기">
            {(["all", "missingRequired", "invalidFormat", "duplicate"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`rounded border px-2 py-1 ${
                  filter === value
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                {value === "all" ? "전체" : TYPE_LABEL[value]}
              </button>
            ))}
          </div>

          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            값 칸을 고친 뒤 Enter를 누르거나 다른 곳을 누르면 바로 다시 검사해요. 올린 엑셀 파일은 바뀌지 않아요.
          </p>

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-2 pr-3">행</th>
                <th className="py-2 pr-3">열</th>
                <th className="py-2 pr-3">사건번호</th>
                <th className="py-2 pr-3">종류</th>
                <th className="py-2 pr-3">문제</th>
                <th className="py-2">값 고치기</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((issue) => {
                const index = rowIndexOf(rows, issue.row);
                const current = index >= 0 ? rows[index][issue.column as ColumnKey] : "";
                return (
                  <tr key={`${issue.row}-${issue.column}-${issue.type}`} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-2 pr-3">{issue.row}</td>
                    <td className="py-2 pr-3">{COLUMN_LABEL[issue.column] ?? issue.column}</td>
                    <td className="py-2 pr-3">{issue.caseNumber || "(비어 있음)"}</td>
                    <td className="py-2 pr-3">{TYPE_LABEL[issue.type]}</td>
                    <td className="py-2 pr-3">{issue.message}</td>
                    <td className="py-2">
                      <EditCell
                        // 반영된 값이 바뀌면 입력칸을 새 값으로 다시 만든다
                        key={current}
                        label={`${issue.row}행 ${COLUMN_LABEL[issue.column] ?? issue.column}`}
                        value={current}
                        onCommit={(value) => commit(issue, value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {visible.length > shown.length ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {shown.length.toLocaleString()}건만 보여줘요. 나머지 {(visible.length - shown.length).toLocaleString()}건은 위쪽
              문제를 고치면 이어서 나와요.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/** 값 한 칸을 고치는 입력칸. Enter를 누르거나 칸을 벗어날 때만 반영한다 (타이핑 도중 행이 사라지지 않게). */
function EditCell({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  return (
    <input
      type="text"
      defaultValue={value}
      aria-label={`${label} 값 고치기`}
      placeholder="값 입력"
      onBlur={(event) => onCommit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className="w-40 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
    />
  );
}
