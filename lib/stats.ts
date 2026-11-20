// Design Ref: §3 통계는 별도 표 없이 제출·수정 이력 표를 집계해서 보여준다.
// Plan: 작업 12번(nice). 오류 건수 집계만 한다 (그래프·기간별 추이는 만들지 않는다).

import { getOfficerStatuses } from "@/lib/collect";
import { createClient } from "@/lib/supabase/server";

export interface OfficerStat {
  readonly name: string;
  readonly submitted: boolean;
  readonly rowCount: number;
  /** 처음 업로드했을 때 오류가 있던 행 수 */
  readonly initialErrorRows: number;
  /** 제출 전에 고친 칸 수 (수정 이력 건수) */
  readonly editedCells: number;
}

export interface RoundStats {
  readonly officers: readonly OfficerStat[];
  readonly totalRows: number;
  readonly totalErrorRows: number;
  readonly totalEditedCells: number;
}

/** 한 회차의 담당자별 오류 집계 */
export async function getRoundStats(roundId: string): Promise<RoundStats> {
  const supabase = await createClient();
  const [statuses, { data: submissions }] = await Promise.all([
    getOfficerStatuses(roundId),
    supabase.from("submissions").select("id, initial_error_count").eq("round_id", roundId).eq("status", "submitted"),
  ]);
  const errorBySubmission = new Map((submissions ?? []).map((s) => [s.id as string, s.initial_error_count as number]));

  // 담당자 수만큼의 가벼운 건수 조회
  const edited = await Promise.all(
    statuses.map(async (status) => {
      if (!status.submissionId) return 0;
      const { count } = await supabase
        .from("edit_logs")
        .select("id, notice_rows!inner(submission_id)", { count: "exact", head: true })
        .eq("notice_rows.submission_id", status.submissionId);
      return count ?? 0;
    }),
  );

  const officers: OfficerStat[] = statuses.map((status, index) => ({
    name: status.name,
    submitted: status.submissionId !== null,
    rowCount: status.rowCount,
    initialErrorRows: status.submissionId ? (errorBySubmission.get(status.submissionId) ?? 0) : 0,
    editedCells: edited[index],
  }));

  return {
    officers,
    totalRows: officers.reduce((sum, o) => sum + o.rowCount, 0),
    totalErrorRows: officers.reduce((sum, o) => sum + o.initialErrorRows, 0),
    totalEditedCells: officers.reduce((sum, o) => sum + o.editedCells, 0),
  };
}
