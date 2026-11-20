"use server";

// Design Ref: §1.1 /collect/accounts — 취합 담당자가 담당자 계정을 직접 등록한다 (PLAN 4번 선행 조건 확정: 직접 등록).
// 계정 만들기는 접근 제한(RLS)에 정책이 없어서 서버 전용 비밀 키로만 할 수 있다.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CreateOfficerState {
  error?: string;
  message?: string;
}

const MIN_PASSWORD_LENGTH = 8;

export async function createOfficer(
  _prev: CreateOfficerState,
  formData: FormData,
): Promise<CreateOfficerState> {
  // 반드시 먼저 취합 담당자인지 확인한다 (화면을 숨기는 것만으로는 막지 못한다)
  await requireRole("collector");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name) return { error: "이름을 입력해 주세요." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "이메일 모양이 맞지 않아요." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.` };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // 메일 인증 없이 바로 쓸 수 있게 한다 (취합 담당자가 직접 등록하므로)
  });
  if (error || !data.user) {
    const alreadyExists = error?.message.toLowerCase().includes("already");
    return { error: alreadyExists ? "이미 등록된 이메일이에요." : "계정을 만들지 못했어요." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    login_id: email,
    name,
    role: "officer",
  });
  if (profileError) {
    // 프로필 저장에 실패하면 로그인만 되고 쓸 수 없는 계정이 남으므로 되돌린다
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "계정 정보를 저장하지 못해 등록을 취소했어요." };
  }

  revalidatePath("/collect/accounts");
  return { message: `${name}님 계정을 등록했어요. 비밀번호는 직접 전달해 주세요.` };
}
