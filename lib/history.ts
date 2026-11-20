// Design Ref: §3 수정 이력, §4.2 — 업로드 후 값을 고친 기록(누가, 언제, 어떤 값을)을 조회한다.
// Plan: 작업 11번(nice). 통지서 작성 후 수정은 기록 대상이 아니다. 취합 담당자 화면에서만 쓴다.

import { COLUMNS } from "@/lib/schema";
import { createClient } from "@/lib/supabase/server";

/** 한 쪽에 보여주는 건수 */
export const HISTORY_PAGE_SIZE = 100;

export interface HistoryEntry {
  readonly id: string;
  readonly officerName: string;
  readonly rowNumber: number;
  readonly caseNumber: string;
  readonly columnLabel: string;
  readonly oldValue: string;
  readonly newValue: string;
  readonly editedAt: string;
}

export interface HistoryPage {
  readonly entries: readonly HistoryEntry[];
  readonly total: number;
  readonly page: number;
  readonly totalPages: number;
}

const LABEL_BY_KEY = new Map<string, string>(COLUMNS.map((column) => [column.key, column.label]));

/** 한 회차의 수정 이력을 최근 순으로 나눠서 가져온다 */
export async function getHistoryPage(roundId: string, requestedPage: number): Promise<HistoryPage> {
  const supabase = await createClient();

  const fetchPage = async (page: number) => {
    const from = (page - 1) * HISTORY_PAGE_SIZE;
    return supabase
      .from("edit_logs")
      .select(
        "id, column_key, old_value, new_value, edited_at, editor:profiles!edited_by(name), notice_rows!inner(row_number, case_number, submissions!inner(round_id))",
        { count: "exact" },
      )
      .eq("notice_rows.submissions.round_id", roundId)
      .order("edited_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + HISTORY_PAGE_SIZE - 1);
  };

  let page = requestedPage;
  let result = await fetchPage(page);
  const total = result.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  if (page > totalPages) {
    page = totalPages;
    result = await fetchPage(page);
  }

  const entries: HistoryEntry[] = (result.data ?? []).map((row) => {
    // 조인 결과는 관계에 따라 객체 또는 배열로 올 수 있어 둘 다 받는다
    const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);
    const editor = one(row.editor as { name: string } | { name: string }[] | null);
    const noticeRow = one(row.notice_rows as { row_number: number; case_number: string } | { row_number: number; case_number: string }[] | null);
    return {
      id: row.id as string,
      officerName: editor?.name ?? "",
      rowNumber: noticeRow?.row_number ?? 0,
      caseNumber: noticeRow?.case_number ?? "",
      columnLabel: LABEL_BY_KEY.get(row.column_key as string) ?? (row.column_key as string),
      oldValue: row.old_value as string,
      newValue: row.new_value as string,
      editedAt: row.edited_at as string,
    };
  });

  return { entries, total, page, totalPages };
}
