import { Suspense } from "react";
import { Header } from "@/app/ui/header";
import { ROLE_LABEL, requireRole, type Role } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "./account-form";

// 취합 담당자 전용: 담당자 계정을 등록하고 등록된 계정 목록을 본다.
async function AccountsContent() {
  const user = await requireRole("collector");

  // 취합 담당자는 접근 제한(RLS) 정책에 따라 모든 사용자 정보를 볼 수 있다
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, login_id, name, role")
    .order("created_at", { ascending: true });

  return (
    <>
      <Header user={user} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8">
        <section className="flex flex-col gap-3">
          <h1 className="text-lg font-semibold">담당자 등록</h1>
          <AccountForm />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">등록된 계정</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-2">이름</th>
                <th className="py-2">이메일</th>
                <th className="py-2">역할</th>
              </tr>
            </thead>
            <tbody>
              {(profiles ?? []).map((profile) => (
                <tr key={profile.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2">{profile.name}</td>
                  <td className="py-2">{profile.login_id}</td>
                  <td className="py-2">{ROLE_LABEL[profile.role as Role]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">불러오는 중…</p>}>
      <AccountsContent />
    </Suspense>
  );
}
