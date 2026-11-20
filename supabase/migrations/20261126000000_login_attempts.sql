-- CHECK.md 남은 항목 C: 로그인 시도 횟수 제한. 이메일별로 최근 실패 기록을 남겨 짧은 시간에 여러 번 틀리면 잠시 막는다.
-- 서버 전용 키로만 읽고 쓴다 (접근 제한을 켜고 정책을 만들지 않으면 일반 사용자는 접근할 수 없다).

create table public.login_attempts (
  id           bigint generated always as identity primary key,
  email        text not null,
  attempted_at timestamptz not null default now()
);

create index login_attempts_email_time_idx on public.login_attempts (email, attempted_at desc);

alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from anon, authenticated;
