// Design Ref: §2.1 담당자 흐름 — "담당자가 값을 고치면 → [처리 3] 다시 실행".
// Plan: 작업 7번 — 업로드 후 값을 고치면 바로 다시 검사한다.
// Plan SC: 업로드한 원본 행은 그대로 두고, 고친 값은 복사본에만 반영한다 (원본과 비교해 고친 곳을 셀 수 있다).
//
// 이 파일은 브라우저와 서버 어디서든 쓸 수 있는 순수 함수만 담는다.
// 제출할 때는 서버가 같은 검사 규칙(lib/validate.ts)으로 반드시 다시 검사한다 (작업 8번).

import { FIRST_DATA_ROW } from "./validate";
import type { ColumnKey, NoticeRow } from "./schema";

/** 엑셀 행 번호(2부터)를 rows 배열의 위치(0부터)로 바꾼다. 범위를 벗어나면 -1 */
export function rowIndexOf(rows: readonly NoticeRow[], sheetRow: number): number {
  const index = sheetRow - FIRST_DATA_ROW;
  return Number.isInteger(index) && index >= 0 && index < rows.length ? index : -1;
}

/**
 * 한 칸의 값을 고친 새 행 목록을 돌려준다. 받은 행 목록은 건드리지 않는다.
 * 앞뒤 공백은 지운다. 값이 그대로거나 행 번호가 맞지 않으면 같은 목록을 그대로 돌려준다.
 */
export function applyEdit(
  rows: readonly NoticeRow[],
  sheetRow: number,
  column: ColumnKey,
  value: string,
): readonly NoticeRow[] {
  const index = rowIndexOf(rows, sheetRow);
  if (index < 0) return rows;

  const next = value.trim();
  if (rows[index][column] === next) return rows;

  return rows.map((row, i) => (i === index ? { ...row, [column]: next } : row));
}

/** 원본과 비교해 고친 칸이 몇 개인지 센다. 다시 원래 값으로 돌려놓은 칸은 세지 않는다. */
export function countEdits(
  original: readonly NoticeRow[],
  current: readonly NoticeRow[],
): number {
  let count = 0;
  current.forEach((row, index) => {
    const before = original[index];
    if (!before) return;
    for (const key of Object.keys(row) as ColumnKey[]) {
      if (row[key] !== before[key]) count += 1;
    }
  });
  return count;
}
