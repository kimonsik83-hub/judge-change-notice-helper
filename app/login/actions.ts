"use server";

// Design Ref: §1.1 /login — 이메일과 비밀번호로 로그인하고 역할별 첫 화면으로 보낸다.

import { redirect } from "next/navigation";
import { homePathFor, type Role } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** 이 시간(분) 안에 이만큼 틀리면 막는다 */
const LOCK_WINDOW_MINUTES = 15;
const MAX_FAILURES = 5;

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

  // 같은 이메일로 짧은 시간에 여러 번 틀렸다면 잠시 막는다 (비밀번호 무차별 대입 방지, CHECK.md C)
  const key = email.toLowerCase().slice(0, 254);
  const guard = createAdminClient();
  const since = new Date(Date.now() - LOCK_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count: recentFailures } = await guard
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("email", key)
    .gte("attempted_at", since);
  if ((recentFailures ?? 0) >= MAX_FAILURES) {
    return { error: `로그인을 여러 번 틀려서 ${LOCK_WINDOW_MINUTES}분 동안 막았어요. 잠시 뒤 다시 시도해 주세요.`, email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await guard.from("login_attempts").insert({ email: key });
    // 어느 쪽이 틀렸는지 알려주지 않는다 (계정 존재 여부 노출 방지)
    return { error: "이메일 또는 비밀번호가 맞지 않아요.", email };
  }
  // 성공하면 실패 기록을 지우고 오래된 기록도 정리한다
  await guard.from("login_attempts").delete().eq("email", key);

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
