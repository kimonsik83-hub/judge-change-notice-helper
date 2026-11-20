-- 수정 이력(PLAN 11번): 제출할 때 "업로드 원본과 달라진 칸"을 edit_logs에 함께 남긴다.
-- submit_notice에 p_edits(수정 목록)를 추가한다. 함수 모양이 바뀌므로 이전 함수는 지우고 다시 만든다.
-- 새 값은 받지 않고 제출된 행(p_rows)에서 직접 읽어, 이력과 저장된 값이 어긋나지 않게 한다.

drop function public.submit_notice(uuid, jsonb, integer);

create function public.submit_notice(
  p_round_id uuid,
  p_rows jsonb,
  p_initial_error_count integer,
  p_edits jsonb default '[]'::jsonb
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

  insert into public.submissions (round_id, officer_id, status, submitted_at, initial_error_count)
  values (p_round_id, (select auth.uid()), 'submitted', now(), greatest(p_initial_error_count, 0))
  on conflict (round_id, officer_id) do update
    set status = 'submitted',
        submitted_at = now(),
        initial_error_count = excluded.initial_error_count
  returning id into v_submission;

  -- 이전 제출 내용은 지우고 새로 넣는다 (덮어쓰기). 이전 수정 이력도 함께 지워진다(행에 딸린 기록).
  delete from public.notice_rows where submission_id = v_submission;

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

  -- 수정 이력: 원본(old)과 제출된 값(new)이 실제로 다른 것만 남긴다
  insert into public.edit_logs (notice_row_id, column_key, old_value, new_value, edited_by)
  select r.id, e.col, e.old_value, coalesce(p_rows -> (e.row_no - 2) ->> e.col, ''), (select auth.uid())
  from jsonb_to_recordset(p_edits) as e(row_no integer, col text, old_value text)
  join public.notice_rows r on r.submission_id = v_submission and r.row_number = e.row_no
  where e.old_value is distinct from coalesce(p_rows -> (e.row_no - 2) ->> e.col, '');

  return v_submission;
end;
$$;

revoke execute on function public.submit_notice(uuid, jsonb, integer, jsonb) from public, anon;
grant execute on function public.submit_notice(uuid, jsonb, integer, jsonb) to authenticated;
