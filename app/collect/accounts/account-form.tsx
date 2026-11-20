"use client";

import { useActionState } from "react";
import { createOfficer, type CreateOfficerState } from "./actions";

const initialState: CreateOfficerState = {};

const inputClass =
  "rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900";

export function AccountForm() {
  const [state, formAction, pending] = useActionState(createOfficer, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        이름
        <input name="name" required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        이메일 (로그인 ID)
        <input name="email" type="email" required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        처음 비밀번호 (8자 이상)
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={inputClass}
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.message ? <p className="text-sm text-green-700">{state.message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "등록 중…" : "담당자 등록"}
      </button>
    </form>
  );
}
