// Design Ref: §1.1 화면 목록, §7 보안 — 로그인한 사람과 역할을 서버에서 확인한다.
// Plan: 작업 4번 — 역할(담당자 / 취합 담당자)별 접근 제한.
// 화면을 숨기는 것만으로는 막지 못하므로, 각 페이지와 서버 액션이 requireRole로 직접 확인한다.

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** officer = 담당자(여러 명), collector = 취합 담당자(1명) */
export type Role = "officer" | "collector";

export interface CurrentUser {
  readonly id: string;
  readonly loginId: string;
  readonly name: string;
  readonly role: Role;
}

export const ROLE_LABEL: Record<Role, string> = {
  officer: "담당자",
  collector: "취합 담당자",
};

/** 역할별 첫 화면 */
export function homePathFor(role: Role): string {
  return role === "collector" ? "/collect" : "/submissions";
}

/**
 * 지금 로그인한 사람을 돌려준다. 로그인하지 않았거나 계정 정보(프로필)가 없으면 null.
 * 같은 요청 안에서는 한 번만 조회한다.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  // getUser는 서버에 물어서 확인하므로 쿠키만 믿는 것보다 안전하다
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("login_id, name, role")
    .eq("id", data.user.id)
    .single();
  if (!profile) return null;

  return {
    id: data.user.id,
    loginId: profile.login_id as string,
    name: profile.name as string,
    role: profile.role as Role,
  };
});

/** 로그인한 사람만 통과. 아니면 로그인 화면으로 보낸다. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** 해당 역할만 통과. 다른 역할이면 그 사람의 첫 화면으로 보낸다. */
export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== role) redirect(homePathFor(user.role));
  return user;
}
