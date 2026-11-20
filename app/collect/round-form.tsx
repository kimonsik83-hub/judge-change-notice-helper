"use client";

import { useActionState } from "react";
import { createRound, type CreateRoundState } from "./actions";

const initialState: CreateRoundState = {};

export function RoundForm() {
  const [state, formAction, pending] = useActionState(createRound, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        새 회차 이름
        <input
          name="name"
          required
          maxLength={60}
          placeholder="예: 2026년 4분기"
          className="w-64 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "여는 중…" : "회차 열기"}
      </button>
      {state.error ? (
        <p role="alert" className="w-full text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.message ? <p className="w-full text-sm text-green-700">{state.message}</p> : null}
    </form>
  );
}
