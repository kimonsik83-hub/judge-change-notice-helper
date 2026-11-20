// Design Ref: §4.2 API 목록 — POST /api/collect/notice: 통지서 생성과 건수 대조.
// Plan: 작업 10번. 순서가 중요하다:
//   ① 진행 조건 확인(미제출자 확인) → ② 회차를 먼저 잠근다(그 사이 새 제출이 끼어들지 못하게) →
//   ③ 잠근 뒤의 최종 데이터를 읽고 건수·중복을 확인 → ④ 통지서 문서 만들기.
// 잠근 회차는 데이터가 바뀌지 않으므로, 같은 요청을 다시 보내면 같은 통지서를 다시 내려받을 수 있다.

import { apiError, isCrossSiteRequest } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { getAllNoticeRows, getOfficerStatuses } from "@/lib/collect";
import { MAX_NOTICE_ROWS, buildNoticeDocument, findNoticeProblems, noticeFileName } from "@/lib/notice";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (isCrossSiteRequest(request)) return apiError(403, "CROSS_SITE", "다른 사이트에서 보낸 요청은 받을 수 없어요.");
  const user = await getCurrentUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "로그인이 필요해요.");
  if (user.role !== "collector") return apiError(403, "FORBIDDEN", "취합 담당자만 통지서를 만들 수 있어요.");

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    body = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return apiError(400, "BAD_REQUEST", "요청을 읽지 못했어요.");
  }
  const roundId = typeof body.roundId === "string" ? body.roundId : "";
  if (!UUID.test(roundId)) return apiError(400, "BAD_REQUEST", "회차를 알 수 없어요.");
  const acceptUnsubmitted = body.acceptUnsubmitted === true;

  const supabase = await createClient();
  const { data: round } = await supabase
    .from("rounds")
    .select("id, name, status")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return apiError(404, "ROUND_NOT_FOUND", "회차를 찾지 못했어요.");

  // ① 진행 조건
  const before = await getOfficerStatuses(round.id as string);
  if (!before.some((status) => status.submissionId !== null && status.rowCount > 0)) {
    return apiError(409, "NO_SUBMISSIONS", "제출된 대상이 아직 없어요.");
  }
  // 너무 많으면 회차를 잠그기 전에 거절한다 (잠근 뒤에는 되돌리기 번거롭다)
  const totalBefore = before.reduce((sum, status) => sum + status.rowCount, 0);
  if (totalBefore > MAX_NOTICE_ROWS) {
    return apiError(413, "TOO_MANY_ROWS", `통지서는 한 번에 ${MAX_NOTICE_ROWS.toLocaleString()}건까지 만들 수 있어요. (지금 ${totalBefore.toLocaleString()}건)`);
  }
  const wasOpen = round.status === "open";
  if (wasOpen) {
    const unsubmitted = before.filter((status) => status.submissionId === null).map((status) => status.name);
    if (unsubmitted.length > 0 && !acceptUnsubmitted) {
      return apiError(409, "UNSUBMITTED_NOT_CONFIRMED", "아직 제출하지 않은 담당자가 있어요. 확인한 뒤 진행해 주세요.", {
        unsubmitted,
      });
    }
  }

  // ② 열려 있었다면 먼저 잠근다. 조건(.eq status open)이 있어서 동시에 두 번 눌러도 한 번만 잠긴다.
  let justLocked = false;
  if (wasOpen) {
    const { data: locked, error } = await supabase
      .from("rounds")
      .update({ status: "locked", notice_generated_at: new Date().toISOString() })
      .eq("id", round.id as string)
      .eq("status", "open")
      .select("id");
    if (error) return apiError(500, "LOCK_FAILED", "회차를 잠그지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    justLocked = (locked?.length ?? 0) === 1;
  }

  // 잠금을 풀어 원래대로 돌린다 (통지서를 만들 수 없는 문제가 발견됐을 때만)
  const unlockIfNeeded = async () => {
    if (!justLocked) return;
    await supabase
      .from("rounds")
      .update({ status: "open", notice_generated_at: null })
      .eq("id", round.id as string)
      .eq("status", "locked");
  };

  // ③ 잠근 뒤의 최종 데이터를 읽는다
  const statuses = await getOfficerStatuses(round.id as string);
  const submissionIds = statuses.flatMap((status) => (status.submissionId ? [status.submissionId] : []));
  const expectedCount = statuses.reduce((sum, status) => sum + status.rowCount, 0);
  const rows = await getAllNoticeRows(submissionIds);

  // 건수 100% 일치: 제출된 건수와 가져온 건수가 다르면 통지서를 만들지 않는다 (잠긴 데이터는 그대로 남는다)
  if (rows.length !== expectedCount) {
    console.error("통지서 건수 불일치", { expected: expectedCount, actual: rows.length });
    await unlockIfNeeded(); // 통지서를 내주지 못했으니 방금 건 잠금은 푼다 (담당자가 다시 제출할 수 있게)
    return apiError(500, "COUNT_MISMATCH", "제출된 건수와 읽어온 건수가 달라서 통지서를 만들지 않았어요. 다시 시도해 주세요.", {
      expected: expectedCount,
      actual: rows.length,
    });
  }

  const problems = findNoticeProblems(rows);
  if (problems.duplicateRowCount > 0) {
    await unlockIfNeeded();
    return apiError(409, "DUPLICATES", "담당자 사이에 겹치는 사건번호가 있어서 통지서를 만들지 않았어요. 취합 화면에서 확인해 주세요.", {
      duplicateRowCount: problems.duplicateRowCount,
    });
  }

  // ④ 통지서 문서 만들기
  let document: Awaited<ReturnType<typeof buildNoticeDocument>>;
  try {
    document = await buildNoticeDocument({ roundName: round.name as string, createdAt: new Date(), rows });
  } catch (error) {
    // 사건 정보가 로그에 남지 않도록 오류 이름만 기록한다. 통지서를 내주지 못했으니 방금 건 잠금은 푼다.
    console.error("통지서 문서 만들기 실패", error instanceof Error ? error.name : "unknown");
    await unlockIfNeeded();
    return apiError(500, "DOCUMENT_FAILED", "통지서 문서를 만들지 못했어요. 회차는 그대로 열려 있으니 잠시 뒤 다시 시도해 주세요.");
  }
  if (document.rowCount !== expectedCount) {
    await unlockIfNeeded();
    return apiError(500, "COUNT_MISMATCH", "통지서의 건수가 제출된 건수와 달라서 중단했어요.", {
      expected: expectedCount,
      actual: document.rowCount,
    });
  }

  return new Response(new Uint8Array(document.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(noticeFileName(round.name as string))}`,
      "Cache-Control": "no-store",
      "X-Notice-Count": String(document.rowCount),
      "X-Notice-Review-Count": String(document.reviewCount),
      "X-Round-Locked": justLocked ? "just" : "already",
    },
  });
}
