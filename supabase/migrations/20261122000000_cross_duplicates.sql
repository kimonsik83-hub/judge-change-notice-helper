-- 담당자 사이 사건번호 중복 찾기 (PLAN 9번)
-- Design Ref: §2.2 취합 담당자 흐름 — "합친 뒤 담당자 사이 사건번호 중복 검사"
--
-- 같은 담당자 안의 중복은 제출 전에 이미 걸러지므로, 여기서는 "서로 다른 담당자"가 같은 사건번호를 올린 경우만 찾는다.
-- security invoker: 호출한 사람의 권한으로 실행되므로 기존 접근 제한(RLS)이 그대로 적용된다.
--  → 취합 담당자는 전체를 보고, 담당자가 부르면 자기 행만 보여서 중복이 나오지 않는다.

create function public.cross_officer_duplicates(p_round_id uuid)
returns table (case_number text, officer_name text, row_number integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with dup as (
    -- 앞뒤 공백을 지운 사건번호가 2명 이상의 담당자에게 나온 것
    select btrim(r.case_number) as case_number
    from public.notice_rows r
    join public.submissions s on s.id = r.submission_id
    where s.round_id = p_round_id
      and s.status = 'submitted'
      and btrim(r.case_number) <> ''
    group by btrim(r.case_number)
    having count(distinct s.officer_id) > 1
  )
  select btrim(r.case_number) as case_number, p.name as officer_name, r.row_number
  from public.notice_rows r
  join public.submissions s on s.id = r.submission_id
  join public.profiles p on p.id = s.officer_id
  join dup d on d.case_number = btrim(r.case_number)
  where s.round_id = p_round_id
    and s.status = 'submitted'
  order by btrim(r.case_number), p.name, r.row_number
$$;

revoke execute on function public.cross_officer_duplicates(uuid) from public, anon;
grant execute on function public.cross_officer_duplicates(uuid) to authenticated;
