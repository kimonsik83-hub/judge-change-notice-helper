// Design Ref: §1.2 "양식 내려받기 버튼" — GET /api/submissions/template: 빈 양식(.xlsx)을 내려준다.

import { apiError } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { buildTemplateWorkbook } from "@/lib/excel";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "로그인이 필요해요.");

  const file = await buildTemplateWorkbook();
  const fileName = encodeURIComponent("변경통지_업로드_양식.xlsx");

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
      "Cache-Control": "no-store",
    },
  });
}
