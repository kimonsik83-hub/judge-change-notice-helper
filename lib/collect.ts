// Design Ref: §1.3 취합 담당자 화면, §2.2 취합 흐름 — 제출 현황, 전체 대상(나눠서 보기), 담당자 사이 중복을 조회한다.
// Plan: 작업 9번. 로그인한 취합 담당자의 권한으로 읽으므로 전체가 보이고, 다른 역할이면 DB 접근 제한(RLS)이 막는다.
// 주의: Supabase는 한 번에 최대 1,000행만 돌려주므로, 건수는 count로 따로 세고 목록은 나눠서(range) 가져온다.

import type { NoticeRow } from "@/lib/schema";
import { createClient } from "@/lib/supabase/server";

export interface RoundView {
  readonly id: string;
  readonly name: string;
  readonly status: "open" | "locked";
}

/** 지금 볼 회차: 열린 회차가 있으면 그것, 없으면 가장 최근 회차. 회차가 하나도 없으면 null */
export async function getViewRound(): Promise<RoundView | null> {
  const supabase = await createClient();
  const { data: open } = await supabase
    .from("rounds")
    .select("id, name, status")
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (open) return open as RoundView;

  const { data: latest } = await supabase
    .from("rounds")
    .select("id, name, status")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (latest as RoundView | null) ?? null;
}

export interface OfficerStatus {
  readonly id: string;
  readonly name: string;
  readonly loginId: string;
  /** 제출했으면 제출 id, 아니면 null */
  readonly submissionId: string | null;
  readonly submittedAt: string | null;
  readonly rowCount: number;
}

/** 모든 담당자의 이 회차 제출 현황 (제출하지 않은 담당자도 포함) */
export async function getOfficerStatuses(roundId: string): Promise<OfficerStatus[]> {
  const supabase = await createClient();

  const [{ data: officers }, { data: submissions }] = await Promise.all([
    supabase.from("profiles").select("id, name, login_id").eq("role", "officer").order("name"),
    supabase
      .from("submissions")
      .select("id, officer_id, submitted_at")
      .eq("round_id", roundId)
      .eq("status", "submitted"),
  ]);

  // 제출마다 행 수를 센다 (담당자 수만큼의 가벼운 조회)
  const counts = new Map<string, number>();
  await Promise.all(
    (submissions ?? []).map(async (submission) => {
      const { count } = await supabase
        .from("notice_rows")
        .select("id", { count: "exact", head: true })
        .eq("submission_id", submission.id as string);
      counts.set(submission.id as string, count ?? 0);
    }),
  );

  const submissionByOfficer = new Map(
    (submissions ?? []).map((submission) => [submission.officer_id as string, submission]),
  );

  return (officers ?? []).map((officer) => {
    const submission = submissionByOfficer.get(officer.id as string);
    return {
      id: officer.id as string,
      name: officer.name as string,
      loginId: officer.login_id as string,
      submissionId: submission ? (submission.id as string) : null,
      submittedAt: submission ? ((submission.submitted_at as string | null) ?? null) : null,
      rowCount: submission ? (counts.get(submission.id as string) ?? 0) : 0,
    };
  });
}

export interface CrossDuplicateRow {
  readonly caseNumber: string;
  readonly officerName: string;
  readonly rowNumber: number;
}

export interface CrossDuplicates {
  /** 중복된 사건번호가 몇 개인지 */
  readonly caseCount: number;
  /** 중복에 걸린 행들 (사건번호 순). 너무 많으면 앞부분만 */
  readonly rows: readonly CrossDuplicateRow[];
  /** 한 번에 가져올 수 있는 양을 넘어 일부만 담았는지 */
  readonly truncated: boolean;
}

/** Supabase가 한 번에 돌려주는 최대 행 수 */
const SUPABASE_MAX_ROWS = 1000;

/** 서로 다른 담당자가 같은 사건번호를 올린 경우를 찾는다 (DB 함수 cross_officer_duplicates) */
export async function getCrossDuplicates(roundId: string): Promise<CrossDuplicates> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("cross_officer_duplicates", { p_round_id: roundId });

  const rows: CrossDuplicateRow[] = (data ?? []).map(
    (row: { case_number: string; officer_name: string; row_number: number }) => ({
      caseNumber: row.case_number,
      officerName: row.officer_name,
      rowNumber: row.row_number,
    }),
  );

  return {
    caseCount: new Set(rows.map((row) => row.caseNumber)).size,
    rows,
    truncated: rows.length >= SUPABASE_MAX_ROWS,
  };
}

/** 전체 대상 표에서 한 쪽에 보여주는 건수 */
export const PAGE_SIZE = 100;
/** 검색어 최대 길이 */
export const MAX_QUERY_LENGTH = 50;

export interface TargetRow {
  readonly officerName: string;
  readonly rowNumber: number;
  readonly caseNumber: string;
  readonly noticeFlag: string;
  readonly oldPanel: string;
  readonly newPanel: string;
  readonly oldJudge: string;
  readonly newJudge: string;
  readonly investigator: string;
  readonly meeting1: string;
  readonly meeting2: string;
  readonly meeting3: string;
  readonly onHold: string;
  readonly decision: string;
}

export interface TargetPage {
  readonly rows: readonly TargetRow[];
  readonly total: number;
  /** 실제로 보여주는 쪽 번호(1부터). 요청한 쪽이 범위를 벗어나면 맞춰서 돌려준다 */
  readonly page: number;
  readonly totalPages: number;
}

/** 전체 행을 가져올 때 동시에 보내는 요청 수 */
const FETCH_BATCH = 5;

/**
 * 통지서에 넣을 제출 전체의 모든 행을 가져온다 (PLAN 10번).
 * 사건번호 순(같으면 제출, 엑셀 행 순)으로 항상 같은 순서가 나온다.
 * Supabase는 한 번에 1,000행까지만 주므로 나눠서 가져온다.
 */
export async function getAllNoticeRows(submissionIds: readonly string[]): Promise<NoticeRow[]> {
  if (submissionIds.length === 0) return [];
  const supabase = await createClient();

  const { count } = await supabase
    .from("notice_rows")
    .select("id", { count: "exact", head: true })
    .in("submission_id", [...submissionIds]);
  const total = count ?? 0;

  const fetchChunk = async (from: number) => {
    const { data } = await supabase
      .from("notice_rows")
      .select(
        "case_number, notice_flag, old_panel, new_panel, old_judge, new_judge, investigator, meeting1, meeting2, meeting3, on_hold, decision",
      )
      .in("submission_id", [...submissionIds])
      .order("case_number", { ascending: true })
      .order("submission_id", { ascending: true })
      .order("row_number", { ascending: true })
      .range(from, from + SUPABASE_MAX_ROWS - 1);
    return data ?? [];
  };

  const starts: number[] = [];
  for (let from = 0; from < total; from += SUPABASE_MAX_ROWS) starts.push(from);

  const chunks: Awaited<ReturnType<typeof fetchChunk>>[] = [];
  for (let i = 0; i < starts.length; i += FETCH_BATCH) {
    chunks.push(...(await Promise.all(starts.slice(i, i + FETCH_BATCH).map(fetchChunk))));
  }

  return chunks.flat().map((row) => ({
    caseNumber: row.case_number as string,
    noticeFlag: row.notice_flag as string,
    oldPanel: row.old_panel as string,
    newPanel: row.new_panel as string,
    oldJudge: row.old_judge as string,
    newJudge: row.new_judge as string,
    investigator: row.investigator as string,
    meeting1: row.meeting1 as string,
    meeting2: row.meeting2 as string,
    meeting3: row.meeting3 as string,
    onHold: row.on_hold as string,
    decision: row.decision as string,
  }));
}

/** LIKE 검색에서 특별한 뜻을 가진 글자를 그냥 글자로 취급하게 만든다 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** 쪽 번호를 1 이상의 정수로 정리한다. 이상한 값이면 1 */
export function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/**
 * 제출된 전체 대상을 나눠서 가져온다.
 * @param submissionIds 보여줄 제출들 (담당자 필터가 있으면 그 담당자의 제출 하나)
 * @param officerBySubmission 제출 id → 담당자 이름
 * @param query 사건번호 검색어(일부만 맞아도 됨, 대소문자 무시)
 */
export async function getTargetPage(options: {
  submissionIds: readonly string[];
  officerBySubmission: ReadonlyMap<string, string>;
  page: number;
  query?: string;
}): Promise<TargetPage> {
  const { submissionIds, officerBySubmission } = options;
  if (submissionIds.length === 0) return { rows: [], total: 0, page: 1, totalPages: 1 };

  const supabase = await createClient();
  const query = (options.query ?? "").trim().slice(0, MAX_QUERY_LENGTH);

  // 조건에 맞는 행을 가져오는 조회 (쪽 번호만 바꿔서 다시 쓸 수 있게 함수로 둔다)
  const fetchRows = async (page: number) => {
    let rowsQuery = supabase
      .from("notice_rows")
      .select(
        "submission_id, row_number, case_number, notice_flag, old_panel, new_panel, old_judge, new_judge, investigator, meeting1, meeting2, meeting3, on_hold, decision",
      )
      .in("submission_id", [...submissionIds]);
    if (query) rowsQuery = rowsQuery.ilike("case_number", `%${escapeLike(query)}%`);
    const from = (page - 1) * PAGE_SIZE;
    const { data } = await rowsQuery
      .order("case_number", { ascending: true })
      .order("submission_id", { ascending: true })
      .order("row_number", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    return data ?? [];
  };

  // 전체 건수와 요청한 쪽의 행을 동시에 가져온다 (서로 기다릴 필요가 없다)
  let countQuery = supabase
    .from("notice_rows")
    .select("id", { count: "exact", head: true })
    .in("submission_id", [...submissionIds]);
  if (query) countQuery = countQuery.ilike("case_number", `%${escapeLike(query)}%`);
  const [{ count }, firstTry] = await Promise.all([countQuery, fetchRows(options.page)]);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(options.page, totalPages);
  // 요청한 쪽이 마지막 쪽을 넘었다면(드문 경우) 마지막 쪽을 다시 가져온다
  const data = page === options.page ? firstTry : await fetchRows(page);

  const rows: TargetRow[] = data.map((row) => ({
    officerName: officerBySubmission.get(row.submission_id as string) ?? "",
    rowNumber: row.row_number as number,
    caseNumber: row.case_number as string,
    noticeFlag: row.notice_flag as string,
    oldPanel: row.old_panel as string,
    newPanel: row.new_panel as string,
    oldJudge: row.old_judge as string,
    newJudge: row.new_judge as string,
    investigator: row.investigator as string,
    meeting1: row.meeting1 as string,
    meeting2: row.meeting2 as string,
    meeting3: row.meeting3 as string,
    onHold: row.on_hold as string,
    decision: row.decision as string,
  }));

  return { rows, total, page, totalPages };
}
