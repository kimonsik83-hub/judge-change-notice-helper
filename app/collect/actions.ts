"use server";

// Design Ref: §3 데이터 모델(회차) — 취합 담당자가 새 회차를 만든다. 열린 회차는 한 번에 하나만 둘 수 있다.
// 회차를 잠그는 일은 통지서를 작성할 때(PLAN 10번) 함께 한다.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface CreateRoundState {
  error?: string;
  message?: string;
}

const MAX_NAME_LENGTH = 60;

export async function createRound(
  _prev: CreateRoundState,
  formData: FormData,
): Promise<CreateRoundState> {
  // 먼저 취합 담당자인지 서버에서 확인한다
  await requireRole("collector");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "회차 이름을 입력해 주세요. 예: 2026년 4분기" };
  if (name.length > MAX_NAME_LENGTH) return { error: `회차 이름은 ${MAX_NAME_LENGTH}자 이하로 적어 주세요.` };

  const supabase = await createClient();
  const { error } = await supabase.from("rounds").insert({ name });
  if (error) {
    // 23505: 열린 회차가 이미 있을 때 (DB의 "열린 회차는 하나" 규칙)
    if (error.code === "23505") return { error: "이미 열려 있는 회차가 있어요. 그 회차를 마친 뒤 새로 만들 수 있어요." };
    return { error: "회차를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  }

  revalidatePath("/collect");
  return { message: `'${name}' 회차를 열었어요. 이제 담당자들이 제출할 수 있어요.` };
}
