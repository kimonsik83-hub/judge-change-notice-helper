"use client";

// Design Ref: §1.2 담당자 — 업로드·검사 화면. ① 엑셀 올리기 ② 검사 결과 (요약 + 오류 표).
// Plan: 작업 6번. 값 고치기는 7번, 최종 제출은 8번에서 이 화면에 이어서 만든다.

import { useRef, useState } from "react";
import { COLUMNS } from "@/lib/schema";
import type { Issue, IssueType, ValidationResult } from "@/lib/validate";

interface CheckData {
  fileName: string;
  totalRows: number;
  unknownHeaders: string[];
  result: ValidationResult;
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; data: CheckData };

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

export function UploadChecker() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ status: "idle" });
  const [filter, setFilter] = useState<IssueType | "all">("all");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setState({ status: "error", message: "엑셀 파일을 먼저 선택해 주세요." });
      return;
    }

    setState({ status: "loading" });
    setFilter("all");
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
      setState({ status: "done", data: json.data as CheckData });
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

      {state.status === "done" ? (
        <Result data={state.data} filter={filter} onFilterChange={setFilter} />
      ) : null}
    </div>
  );
}

function Result({
  data,
  filter,
  onFilterChange,
}: {
  data: CheckData;
  filter: IssueType | "all";
  onFilterChange: (value: IssueType | "all") => void;
}) {
  const { result } = data;
  const visible: Issue[] =
    filter === "all" ? [...result.issues] : result.issues.filter((issue) => issue.type === filter);
  const shown = visible.slice(0, MAX_VISIBLE_ISSUES);

  return (
    <section aria-label="검사 결과" className="flex flex-col gap-4">
      <p className="text-sm">
        <strong>{data.fileName}</strong> · 전체 <strong>{data.totalRows.toLocaleString()}</strong>건 · 오류가 있는 행{" "}
        <strong>{result.errorRowCount.toLocaleString()}</strong>개 (필수 누락 {result.missingCount.toLocaleString()} · 형식
        오류 {result.formatCount.toLocaleString()} · 중복 {result.duplicateCount.toLocaleString()})
      </p>

      {data.unknownHeaders.length > 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          양식에 없는 열은 검사하지 않았어요: {data.unknownHeaders.join(", ")}
        </p>
      ) : null}

      {result.issues.length === 0 ? (
        <p className="text-sm text-green-700">오류가 없어요. (최종 제출은 다음 작업에서 만들어요)</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-sm" role="group" aria-label="문제 종류 보기">
            {(["all", "missingRequired", "invalidFormat", "duplicate"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onFilterChange(value)}
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

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-2 pr-3">행</th>
                <th className="py-2 pr-3">열</th>
                <th className="py-2 pr-3">사건번호</th>
                <th className="py-2 pr-3">종류</th>
                <th className="py-2">문제</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((issue, index) => (
                <tr key={`${issue.row}-${issue.column}-${issue.type}-${index}`} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-3">{issue.row}</td>
                  <td className="py-2 pr-3">{COLUMN_LABEL[issue.column] ?? issue.column}</td>
                  <td className="py-2 pr-3">{issue.caseNumber || "(비어 있음)"}</td>
                  <td className="py-2 pr-3">{TYPE_LABEL[issue.type]}</td>
                  <td className="py-2">{issue.message}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {visible.length > shown.length ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {shown.length.toLocaleString()}건만 보여줘요. 나머지 {(visible.length - shown.length).toLocaleString()}건은 위쪽
              문제를 고친 뒤 다시 검사하면 나와요.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
