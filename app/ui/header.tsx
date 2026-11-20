import Link from "next/link";
import { logout } from "@/app/login/actions";
import { ROLE_LABEL, type CurrentUser } from "@/lib/auth";

/** 로그인 후 모든 화면 맨 위에 보이는 공통 머리글 (Design §1.2 상단 영역) */
export function Header({ user }: { user: CurrentUser }) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="flex items-center gap-4">
        <span className="font-semibold">심판관 변경통지서 작성 도우미</span>
        {user.role === "collector" ? (
          <nav className="flex gap-3 text-sm">
            <Link href="/collect" className="underline-offset-4 hover:underline">
              제출 현황
            </Link>
            <Link href="/collect/accounts" className="underline-offset-4 hover:underline">
              계정 관리
            </Link>
          </nav>
        ) : null}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span>
          {user.name} · {ROLE_LABEL[user.role]}
        </span>
        <form action={logout}>
          <button type="submit" className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700">
            로그아웃
          </button>
        </form>
      </div>
    </header>
  );
}
