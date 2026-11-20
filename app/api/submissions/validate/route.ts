// Design Ref: §4.2 API 목록 — POST /api/submissions/validate: 올린 엑셀을 검사해 결과를 돌려준다 (저장하지 않는다).
// Plan: 작업 6번. 담당자(officer)만 쓸 수 있고, 역할은 여기서 서버가 직접 확인한다.

import { NextResponse } from "next/server";
import { apiError, isCrossSiteRequest } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { MAX_FILE_BYTES, parseNoticeWorkbook } from "@/lib/excel";
import { validateRows } from "@/lib/validate";

export async function POST(request: Request) {
  if (isCrossSiteRequest(request)) return apiError(403, "CROSS_SITE", "다른 사이트에서 보낸 요청은 받을 수 없어요.");
  const user = await getCurrentUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "로그인이 필요해요.");
  if (user.role !== "officer") return apiError(403, "FORBIDDEN", "담당자만 업로드할 수 있어요.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "BAD_REQUEST", "파일을 받지 못했어요. 다시 시도해 주세요.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return apiError(400, "BAD_REQUEST", "파일을 선택해 주세요.");
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return apiError(400, "INVALID_FILE", "엑셀(.xlsx) 파일만 올릴 수 있어요.");
  }
  if (file.size > MAX_FILE_BYTES) {
    return apiError(413, "FILE_TOO_LARGE", `파일은 ${MAX_FILE_BYTES / 1024 / 1024}MB 이하여야 해요.`);
  }

  const parsed = await parseNoticeWorkbook(await file.arrayBuffer());
  if (!parsed.ok) {
    return apiError(
      422,
      "INVALID_FILE",
      parsed.error,
      parsed.missingHeaders ? { missingHeaders: parsed.missingHeaders } : undefined,
    );
  }

  const result = validateRows(parsed.rows);
  return NextResponse.json({
    data: {
      fileName: file.name,
      totalRows: parsed.rows.length,
      rows: parsed.rows,
      unknownHeaders: parsed.unknownHeaders,
      result,
    },
  });
}
