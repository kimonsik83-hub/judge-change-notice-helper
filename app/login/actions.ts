"use server";

// Design Ref: §1.1 /login — 이메일과 비밀번호로 로그인하고 역할별 첫 화면으로 보낸다.

import { redirect } from "next/navigation";
import { homePathFor, type Role } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
  /** 실패했을 때 이메일 칸이 지워지지 않도록 되돌려준다 (비밀번호는 돌려주지 않는다) */
  email?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력해 주세요.", email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    // 어느 쪽이 틀렸는지 알려주지 않는다 (계정 존재 여부 노출 방지)
    return { error: "이메일 또는 비밀번호가 맞지 않아요.", email };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (!profile) {
    await supabase.auth.signOut();
    return { error: "등록된 계정 정보가 없어요. 취합 담당자에게 문의해 주세요.", email };
  }

  redirect(homePathFor(profile.role as Role));
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
