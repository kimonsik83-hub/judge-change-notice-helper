// 맨 처음 취합 담당자(1명) 계정을 만드는 도구. 이 계정으로 로그인해야 담당자들을 등록할 수 있다.
// 비밀번호를 파일이나 명령줄 기록에 남기지 않도록, 값은 이 명령을 실행하는 창에서만 환경 변수로 넘긴다.
//
// 사용법 (PowerShell):
//   $env:FIRST_COLLECTOR_EMAIL = "name@example.com"
//   $env:FIRST_COLLECTOR_NAME = "홍길동"
//   $env:FIRST_COLLECTOR_PASSWORD = "8자 이상 비밀번호"
//   node --env-file=.env scripts/create-first-collector.mjs
//   Remove-Item Env:FIRST_COLLECTOR_PASSWORD

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const email = (process.env.FIRST_COLLECTOR_EMAIL ?? "").trim().toLowerCase();
const name = (process.env.FIRST_COLLECTOR_NAME ?? "").trim();
const password = process.env.FIRST_COLLECTOR_PASSWORD ?? "";

function fail(message) {
  console.error(`실패: ${message}`);
  process.exit(1);
}

if (!url || !secretKey) fail(".env에 NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SECRET_KEY가 없어요. (node --env-file=.env 로 실행했나요?)");
if (!email || !name || password.length < 8) fail("FIRST_COLLECTOR_EMAIL, FIRST_COLLECTOR_NAME, FIRST_COLLECTOR_PASSWORD(8자 이상)를 먼저 설정하세요.");

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 취합 담당자는 1명뿐이다
const { count, error: countError } = await admin
  .from("profiles")
  .select("id", { count: "exact", head: true })
  .eq("role", "collector");
if (countError) fail(`기존 계정을 확인하지 못했어요: ${countError.message}`);
if ((count ?? 0) > 0) fail("취합 담당자 계정이 이미 있어요. 새로 만들지 않았어요.");

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (error || !data.user) fail(`계정을 만들지 못했어요: ${error?.message}`);

const { error: profileError } = await admin
  .from("profiles")
  .insert({ id: data.user.id, login_id: email, name, role: "collector" });
if (profileError) {
  await admin.auth.admin.deleteUser(data.user.id);
  fail(`계정 정보를 저장하지 못해 취소했어요: ${profileError.message}`);
}

console.log(`완료: 취합 담당자 계정을 만들었어요 (${email}).`);
