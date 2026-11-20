-- notice_rows 접근 제한을 "행마다 함수 호출" 방식에서 "한 번만 계산" 방식으로 바꾼다 (PLAN 9번에서 발견한 속도 문제).
--
-- 문제: 기존 정책은 행마다 can_read_submission() / can_write_submission() 함수를 불러서,
--       행 5,000개를 읽거나 쓸 때 건수 세기 1초, 중복 찾기 8초, 제출 저장 3.7초가 걸렸다.
-- 해결: (select ...) 로 감싼 값은 쿼리당 한 번만 계산되고, "submission_id in (서브쿼리)"는 한 번 만든 목록과 비교한다.
--
-- 권한의 내용은 바뀌지 않는다:
--   읽기: 내 제출의 행이거나, 내가 취합 담당자일 때
--   쓰기: 내 제출의 행이고, 그 회차가 열려 있을 때
-- (edit_logs 정책은 여전히 can_read_submission / can_write_submission 함수를 쓴다.)

drop policy notice_rows_select on public.notice_rows;
drop policy notice_rows_insert on public.notice_rows;
drop policy notice_rows_update on public.notice_rows;
drop policy notice_rows_delete on public.notice_rows;

create policy notice_rows_select on public.notice_rows
  for select to authenticated
  using (
    (select public.is_collector())
    or submission_id in (
      select s.id from public.submissions s where s.officer_id = (select auth.uid())
    )
  );

create policy notice_rows_insert on public.notice_rows
  for insert to authenticated
  with check (
    submission_id in (
      select s.id
      from public.submissions s
      join public.rounds r on r.id = s.round_id
      where s.officer_id = (select auth.uid()) and r.status = 'open'
    )
  );

create policy notice_rows_update on public.notice_rows
  for update to authenticated
  using (
    submission_id in (
      select s.id
      from public.submissions s
      join public.rounds r on r.id = s.round_id
      where s.officer_id = (select auth.uid()) and r.status = 'open'
    )
  )
  with check (
    submission_id in (
      select s.id
      from public.submissions s
      join public.rounds r on r.id = s.round_id
      where s.officer_id = (select auth.uid()) and r.status = 'open'
    )
  );

create policy notice_rows_delete on public.notice_rows
  for delete to authenticated
  using (
    submission_id in (
      select s.id
      from public.submissions s
      join public.rounds r on r.id = s.round_id
      where s.officer_id = (select auth.uid()) and r.status = 'open'
    )
  );
