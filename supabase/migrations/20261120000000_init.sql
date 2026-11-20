-- 심판관 변경통지서 작성 도우미 — 데이터 저장소 초기 설계
-- Design Ref: §3 데이터 모델 (회차, 제출, 대상 행, 사용자, 수정 이력)
-- Plan: 작업 3번 — 표를 준비하고, 담당자는 자기 제출분만 / 취합 담당자는 전체를 보게 서버에서 막는다.
-- 역할: officer = 담당자(여러 명), collector = 취합 담당자(1명)

-- ─────────────────────────────────────────────
-- 1. 사용자 (로그인한 사람의 이름·역할)
-- ─────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  login_id    text not null unique,            -- 로그인 ID(이메일)
  name        text not null,
  role        text not null check (role in ('officer', 'collector')),
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 2. 회차 (2~3개월마다 한 번의 취합 단위)
-- ─────────────────────────────────────────────
create table public.rounds (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  status              text not null default 'open' check (status in ('open', 'locked')),
  notice_generated_at timestamptz,             -- 통지서를 작성하면 채우고 회차를 잠근다
  created_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 3. 제출 (한 회차에서 담당자 한 명의 제출 묶음)
--    같은 회차·같은 담당자는 하나뿐이라 다시 제출하면 덮어쓴다.
-- ─────────────────────────────────────────────
create table public.submissions (
  id                  uuid primary key default gen_random_uuid(),
  round_id            uuid not null references public.rounds (id) on delete cascade,
  officer_id          uuid not null references public.profiles (id),
  status              text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at        timestamptz,
  initial_error_count integer not null default 0, -- 통계(오류 집계)용으로 처음 검사 결과를 저장
  created_at          timestamptz not null default now(),
  unique (round_id, officer_id)
);

-- ─────────────────────────────────────────────
-- 4. 대상 행 (엑셀 한 줄 = 한 건). 열 12개는 lib/schema.ts와 같다.
-- ─────────────────────────────────────────────
create table public.notice_rows (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  row_number    integer not null,               -- 엑셀에서 보이는 행 번호 (데이터는 2행부터)
  case_number   text not null default '',       -- 사건번호
  notice_flag   text not null default '',       -- 통지여부
  old_panel     text not null default '',       -- 기존 심판부
  new_panel     text not null default '',       -- 변경 심판부
  old_judge     text not null default '',       -- 기존 심판관
  new_judge     text not null default '',       -- 변경 심판관
  investigator  text not null default '',       -- 조사관
  meeting1      text not null default '',       -- 회의개최(1차)
  meeting2      text not null default '',       -- 회의개최(2차)
  meeting3      text not null default '',       -- 회의개최(3차)
  on_hold       text not null default '',       -- 보류
  decision      text not null default '',       -- 의결
  unique (submission_id, row_number)
);

create index notice_rows_submission_idx on public.notice_rows (submission_id);
create index notice_rows_case_number_idx on public.notice_rows (case_number);

-- ─────────────────────────────────────────────
-- 5. 수정 이력 (업로드 후 값을 고친 기록. 통지서 작성 후 수정은 기록 대상이 아니다)
-- ─────────────────────────────────────────────
create table public.edit_logs (
  id            uuid primary key default gen_random_uuid(),
  notice_row_id uuid not null references public.notice_rows (id) on delete cascade,
  column_key    text not null,                  -- 어떤 열인지 (lib/schema.ts의 key)
  old_value     text not null default '',
  new_value     text not null default '',
  edited_by     uuid not null references public.profiles (id),
  edited_at     timestamptz not null default now()
);

create index edit_logs_row_idx on public.edit_logs (notice_row_id);

-- ─────────────────────────────────────────────
-- 접근 제한 도우미 함수 (서버에서 역할과 회차 상태를 확인한다)
-- ─────────────────────────────────────────────
create function public.is_collector()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'collector'
  );
$$;

create function public.is_round_open(target_round uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rounds where id = target_round and status = 'open'
  );
$$;

-- 이 제출이 내 것이거나, 내가 취합 담당자인지
create function public.can_read_submission(target_submission uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.submissions s
    where s.id = target_submission
      and (s.officer_id = (select auth.uid()) or public.is_collector())
  );
$$;

-- 이 제출이 내 것이고 회차가 열려 있어서 내가 고칠 수 있는지
create function public.can_write_submission(target_submission uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.submissions s
    where s.id = target_submission
      and s.officer_id = (select auth.uid())
      and public.is_round_open(s.round_id)
  );
$$;

-- ─────────────────────────────────────────────
-- 접근 제한 (RLS): 켜 두면 아래 정책에 허용된 것만 가능하다.
-- 계정 만들기·회차 만들기처럼 정책이 없는 일은 서버 전용 키로만 할 수 있다.
-- ─────────────────────────────────────────────
alter table public.profiles    enable row level security;
alter table public.rounds      enable row level security;
alter table public.submissions enable row level security;
alter table public.notice_rows enable row level security;
alter table public.edit_logs   enable row level security;

-- 사용자: 내 정보는 내가, 전체는 취합 담당자가 본다
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_collector());

-- 회차: 로그인한 사람은 모두 보고, 만들고 고치는 일은 취합 담당자만
create policy rounds_select on public.rounds
  for select to authenticated using (true);
create policy rounds_insert on public.rounds
  for insert to authenticated with check (public.is_collector());
create policy rounds_update on public.rounds
  for update to authenticated
  using (public.is_collector()) with check (public.is_collector());

-- 제출: 담당자는 자기 것만, 취합 담당자는 전체를 본다. 쓰기는 자기 것 + 열린 회차만
create policy submissions_select on public.submissions
  for select to authenticated
  using (officer_id = (select auth.uid()) or public.is_collector());
create policy submissions_insert on public.submissions
  for insert to authenticated
  with check (officer_id = (select auth.uid()) and public.is_round_open(round_id));
create policy submissions_update on public.submissions
  for update to authenticated
  using (officer_id = (select auth.uid()) and public.is_round_open(round_id))
  with check (officer_id = (select auth.uid()) and public.is_round_open(round_id));
create policy submissions_delete on public.submissions
  for delete to authenticated
  using (officer_id = (select auth.uid()) and public.is_round_open(round_id));

-- 대상 행: 내 제출의 행이거나 취합 담당자만 본다. 쓰기는 내 제출 + 열린 회차만
create policy notice_rows_select on public.notice_rows
  for select to authenticated
  using (public.can_read_submission(submission_id));
create policy notice_rows_insert on public.notice_rows
  for insert to authenticated
  with check (public.can_write_submission(submission_id));
create policy notice_rows_update on public.notice_rows
  for update to authenticated
  using (public.can_write_submission(submission_id))
  with check (public.can_write_submission(submission_id));
create policy notice_rows_delete on public.notice_rows
  for delete to authenticated
  using (public.can_write_submission(submission_id));

-- 수정 이력: 내 제출의 이력이거나 취합 담당자만 본다. 남기는 일은 내 제출 + 열린 회차만, 내 이름으로만
create policy edit_logs_select on public.edit_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.notice_rows r
      where r.id = notice_row_id and public.can_read_submission(r.submission_id)
    )
  );
create policy edit_logs_insert on public.edit_logs
  for insert to authenticated
  with check (
    edited_by = (select auth.uid())
    and exists (
      select 1 from public.notice_rows r
      where r.id = notice_row_id and public.can_write_submission(r.submission_id)
    )
  );
