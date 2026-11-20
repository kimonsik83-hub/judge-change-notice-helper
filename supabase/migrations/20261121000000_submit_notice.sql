-- 최종 제출(PLAN 8번): 담당자의 제출을 한 번에(전부 성공 또는 전부 취소) 저장하는 함수와, 열린 회차를 1개로 제한하는 규칙.
-- Design Ref: §3 데이터 모델 (제출은 같은 회차·같은 담당자에 하나뿐이라 다시 제출하면 덮어쓴다), §4.2 POST /api/submissions

-- 열린 회차는 한 번에 하나만 둘 수 있다 (담당자가 어느 회차에 제출할지 헷갈리지 않게)
create unique index rounds_one_open
  on public.rounds ((status))
  where status = 'open';

-- 제출 저장 함수.
-- security invoker: 호출한 사람의 권한으로 실행되므로 기존 접근 제한(RLS)이 그대로 적용된다.
--  → 자기 제출만, 열린 회차에만 쓸 수 있다.
create function public.submit_notice(
  p_round_id uuid,
  p_rows jsonb,
  p_initial_error_count integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_submission uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  if not public.is_round_open(p_round_id) then
    raise exception 'ROUND_LOCKED' using errcode = 'P0001';
  end if;

  -- 같은 회차·같은 담당자의 제출은 하나뿐이라, 있으면 갱신하고 없으면 새로 만든다
  insert into public.submissions (round_id, officer_id, status, submitted_at, initial_error_count)
  values (p_round_id, (select auth.uid()), 'submitted', now(), greatest(p_initial_error_count, 0))
  on conflict (round_id, officer_id) do update
    set status = 'submitted',
        submitted_at = now(),
        initial_error_count = excluded.initial_error_count
  returning id into v_submission;

  -- 이전 제출 내용은 지우고 새로 넣는다 (덮어쓰기)
  delete from public.notice_rows where submission_id = v_submission;

  -- 엑셀 행 번호는 2부터 시작한다 (1행은 머리글)
  insert into public.notice_rows (
    submission_id, row_number,
    case_number, notice_flag, old_panel, new_panel, old_judge, new_judge,
    investigator, meeting1, meeting2, meeting3, on_hold, decision
  )
  select
    v_submission, (t.ord + 1)::integer,
    coalesce(t.r ->> 'caseNumber', ''),
    coalesce(t.r ->> 'noticeFlag', ''),
    coalesce(t.r ->> 'oldPanel', ''),
    coalesce(t.r ->> 'newPanel', ''),
    coalesce(t.r ->> 'oldJudge', ''),
    coalesce(t.r ->> 'newJudge', ''),
    coalesce(t.r ->> 'investigator', ''),
    coalesce(t.r ->> 'meeting1', ''),
    coalesce(t.r ->> 'meeting2', ''),
    coalesce(t.r ->> 'meeting3', ''),
    coalesce(t.r ->> 'onHold', ''),
    coalesce(t.r ->> 'decision', '')
  from jsonb_array_elements(p_rows) with ordinality as t(r, ord);

  return v_submission;
end;
$$;

-- 로그인한 사람만 호출할 수 있다
revoke execute on function public.submit_notice(uuid, jsonb, integer) from public, anon;
grant execute on function public.submit_notice(uuid, jsonb, integer) to authenticated;
