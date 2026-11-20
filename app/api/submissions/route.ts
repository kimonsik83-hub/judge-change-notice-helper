// Design Ref: §4.2 API 목록 — POST /api/submissions: 오류 0건인 내용을 최종 제출한다.
// Plan: 작업 8번. 브라우저의 검사 결과를 믿지 않고 서버가 같은 규칙으로 다시 검사한 뒤 저장한다.
// 저장은 DB 함수(submit_notice) 하나로 처리해서 전부 성공하거나 전부 취소된다.

import { NextResponse } from "next/server";
import { apiError, isCrossSiteRequest } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { MAX_FILE_BYTES, MAX_ROWS } from "@/lib/excel";
import { getMySubmission, getOpenRound } from "@/lib/rounds";
import { sanitizeCount, sanitizeEdits, sanitizeRows } from "@/lib/submit";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateRows } from "@/lib/validate";

export async function POST(request: Request) {
  if (isCrossSiteRequest(request)) return apiError(403, "CROSS_SITE", "다른 사이트에서 보낸 요청은 받을 수 없어요.");
  const user = await getCurrentUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "로그인이 필요해요.");
  if (user.role !== "officer") return apiError(403, "FORBIDDEN", "담당자만 제출할 수 있어요.");

  // 요청 크기 제한 (Vercel 요청 크기 제한 안)
  const text = await request.text();
  if (text.length > MAX_FILE_BYTES) {
    return apiError(413, "PAYLOAD_TOO_LARGE", `제출 내용이 너무 커요. (${MAX_FILE_BYTES / 1024 / 1024}MB 이하)`);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return apiError(400, "BAD_REQUEST", "제출 내용을 읽지 못했어요.");
  }
  const payload = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  const sanitized = sanitizeRows(payload.rows, MAX_ROWS);
  if (!sanitized.ok) return apiError(400, "BAD_REQUEST", sanitized.message);

  // 서버가 다시 검사한다. 오류가 하나라도 있으면 저장하지 않는다.
  const result = validateRows(sanitized.rows);
  if (result.issues.length > 0) {
    return apiError(422, "VALIDATION_FAILED", "아직 오류가 남아 있어서 제출할 수 없어요.", {
      errorRowCount: result.errorRowCount,
      missingCount: result.missingCount,
      formatCount: result.formatCount,
      duplicateCount: result.duplicateCount,
    });
  }

  const round = await getOpenRound();
  if (!round) {
    return apiError(409, "NO_OPEN_ROUND", "열려 있는 회차가 없어요. 취합 담당자가 회차를 만들면 제출할 수 있어요.");
  }

  const previous = await getMySubmission(round.id, user.id);

  // 저장 함수는 서버 전용이다(담당자가 DB를 직접 불러 검사를 건너뛰지 못하게). 위에서 로그인·역할·검사를 확인한 뒤에만 부른다.
  const supabase = createAdminClient();
  const { data: submissionId, error } = await supabase.rpc("submit_notice", {
    p_officer_id: user.id,
    p_round_id: round.id,
    p_rows: sanitized.rows,
    p_initial_error_count: sanitizeCount(payload.initialErrorCount, MAX_ROWS),
    p_edits: sanitizeEdits(payload.edits, sanitized.rows.length),
  });

  if (error) {
    if (error.message.includes("ROUND_LOCKED")) {
      return apiError(409, "ROUND_LOCKED", "이 회차는 이미 통지서가 작성되어 더 이상 제출할 수 없어요.");
    }
    // 사건 정보가 로그에 남지 않도록 오류 코드만 기록한다
    console.error("제출 저장 실패", error.code);
    return apiError(500, "SUBMIT_FAILED", "제출을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  }

  return NextResponse.json({
    data: {
      submissionId,
      roundName: round.name,
      rowCount: sanitized.rows.length,
      overwritten: previous !== null,
    },
  });
}
