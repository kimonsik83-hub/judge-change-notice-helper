-- CHECK.md 2·4순위: 담당자가 서버 검사를 건너뛰고 DB에 직접 쓰지 못하게 하고, 제출과 회차 잠금이 겹치는 경우를 막는다.
--
-- ① 담당자(로그인한 사용자)의 직접 쓰기 정책을 모두 없앤다. 대상 행·수정 이력·제출은 앞으로 서버(제출 API)만 쓴다.
--    읽기 정책(자기 것만, 취합 담당자는 전체)은 그대로다.
-- ② 제출 저장 함수 submit_notice를 서버 전용으로 바꾼다. 서버가 로그인과 역할을 확인하고 검사한 뒤에만 부른다.
--    (함수 안에서도 칸 길이·행 수·수정 이력 모양을 다시 확인한다.)
-- ③ 함수가 회차 행을 FOR SHARE로 잠가서, 통지서 작성(회차 UPDATE)과 동시에 일어나면 한쪽이 기다렸다가 "잠김"을 보게 된다.
-- ④ 로그인하지 않은 사용자가 도우미 함수를 부르지 못하게 하고, 회차 목록도 등록된 사용자에게만 보이게 좁힌다.

-- ① 직접 쓰기 정책 제거
drop policy if exists notice_rows_insert on public.notice_rows;
drop policy if exists notice_rows_update on public.notice_rows;
drop policy if exists notice_rows_delete on public.notice_rows;
drop policy if exists edit_logs_insert on public.edit_logs;
drop policy if exists submissions_insert on public.submissions;
drop policy if exists submissions_update on public.submissions;
drop policy if exists submissions_delete on public.submissions;

-- ② 예전 함수(로그인한 사용자가 직접 부를 수 있던 것)를 지우고 서버 전용으로 다시 만든다
drop function if exists public.submit_notice(uuid, jsonb, integer, jsonb);

create function public.submit_notice(
  p_officer_id uuid,
  p_round_id uuid,
  p_rows jsonb,
  p_initial_error_count integer,
  p_edits jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission uuid;
  v_status text;
  v_count integer;
begin
  -- 담당자 본인인지 (서버가 로그인을 확인한 사용자 id를 넘겨준다)
  if not exists (select 1 from public.profiles where id = p_officer_id and role = 'officer') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  -- 입력 모양 확인: 행 목록은 1~20,000개, 한 칸은 500자 이하의 글자
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'BAD_INPUT' using errcode = 'P0001';
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count < 1 or v_count > 20000 then
    raise exception 'BAD_INPUT' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_rows) as r(v), jsonb_each(r.v) as kv
    where jsonb_typeof(kv.value) not in ('string', 'null')
       or length(kv.value #>> '{}') > 500
  ) then
    raise exception 'BAD_INPUT' using errcode = 'P0001';
  end if;
  if p_edits is not null and (jsonb_typeof(p_edits) <> 'array' or jsonb_array_length(p_edits) > 5000) then
    raise exception 'BAD_INPUT' using errcode = 'P0001';
  end if;

  -- ③ 회차를 공유 잠금으로 읽는다: 통지서 작성이 먼저 잠갔다면 ROUND_LOCKED, 아니면 이 제출이 끝날 때까지 잠글 수 없다
  select status into v_status from public.rounds where id = p_round_id for share;
  if v_status is null or v_status <> 'open' then
    raise exception 'ROUND_LOCKED' using errcode = 'P0001';
  end if;

  insert into public.submissions (round_id, officer_id, status, submitted_at, initial_error_count)
  values (p_round_id, p_officer_id, 'submitted', now(), least(greatest(coalesce(p_initial_error_count, 0), 0), v_count))
  on conflict (round_id, officer_id) do update
    set status = 'submitted',
        submitted_at = now(),
        initial_error_count = excluded.initial_error_count
  returning id into v_submission;

  -- 이전 제출 내용은 지우고 새로 넣는다 (덮어쓰기). 이전 수정 이력도 함께 지워진다.
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

  -- 수정 이력: 열 이름은 양식의 12개만, 원본과 제출 값이 실제로 다른 것만 남긴다
  insert into public.edit_logs (notice_row_id, column_key, old_value, new_value, edited_by)
  select r.id, e."column", left(e."oldValue", 500), coalesce(p_rows -> (e."row" - 2) ->> e."column", ''), p_officer_id
  from jsonb_to_recordset(coalesce(p_edits, '[]'::jsonb)) as e("row" integer, "column" text, "oldValue" text)
  join public.notice_rows r on r.submission_id = v_submission and r.row_number = e."row"
  where e."column" in ('caseNumber','noticeFlag','oldPanel','newPanel','oldJudge','newJudge',
                       'investigator','meeting1','meeting2','meeting3','onHold','decision')
    and e."oldValue" is distinct from coalesce(p_rows -> (e."row" - 2) ->> e."column", '');

  return v_submission;
end;
$$;

-- 서버 전용 키(service_role)만 실행할 수 있다
revoke execute on function public.submit_notice(uuid, uuid, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.submit_notice(uuid, uuid, jsonb, integer, jsonb) to service_role;

-- ④ 도우미 함수는 로그인한 사용자만 (정책 안에서 쓰이므로 authenticated는 유지)
revoke execute on function public.is_collector() from public, anon;
revoke execute on function public.is_round_open(uuid) from public, anon;
revoke execute on function public.can_read_submission(uuid) from public, anon;
revoke execute on function public.can_write_submission(uuid) from public, anon;
grant execute on function public.is_collector() to authenticated;
grant execute on function public.is_round_open(uuid) to authenticated;
grant execute on function public.can_read_submission(uuid) to authenticated;
grant execute on function public.can_write_submission(uuid) to authenticated;

-- 회차 목록은 등록된 사용자(담당자·취합 담당자)에게만 보인다 (가입만 한 외부인은 못 본다)
drop policy if exists rounds_select on public.rounds;
create policy rounds_select on public.rounds
  for select to authenticated
  using ((select auth.uid()) in (select id from public.profiles));
