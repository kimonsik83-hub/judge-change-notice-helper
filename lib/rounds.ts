// Design Ref: §3 데이터 모델 — 회차(2~3개월마다 한 번의 취합 단위)와 내 제출을 조회한다.
// 로그인한 사람의 권한으로 읽으므로, 담당자는 자기 제출만 보인다 (DB 접근 제한이 한 번 더 확인).

import { createClient } from "@/lib/supabase/server";

export interface OpenRound {
  readonly id: string;
  readonly name: string;
}

export interface MySubmission {
  readonly id: string;
  readonly submittedAt: string | null;
  readonly rowCount: number;
}

/** 지금 열려 있는 회차. 열린 회차는 최대 하나다 (DB 규칙). 없으면 null */
export async function getOpenRound(): Promise<OpenRound | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rounds")
    .select("id, name")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as string, name: data.name as string } : null;
}

/** 이 회차에 내가 이미 제출한 내용. 없으면 null */
export async function getMySubmission(roundId: string, officerId: string): Promise<MySubmission | null> {
  const supabase = await createClient();
  const { data: submission } = await supabase
    .from("submissions")
    .select("id, status, submitted_at")
    .eq("round_id", roundId)
    .eq("officer_id", officerId)
    .eq("status", "submitted")
    .maybeSingle();
  if (!submission) return null;

  const { count } = await supabase
    .from("notice_rows")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submission.id as string);

  return {
    id: submission.id as string,
    submittedAt: (submission.submitted_at as string | null) ?? null,
    rowCount: count ?? 0,
  };
}
