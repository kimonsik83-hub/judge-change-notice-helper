// Design Ref: §4.2 POST /api/submissions — 제출 요청의 행 데이터를 믿지 않고 모양을 다시 확인한다.
// Plan: 작업 8번 — 서버는 브라우저가 보낸 값을 그대로 쓰지 않고, 정해진 12개 열의 글자 값만 뽑아 쓴다.
// 순수 함수라서 시험하기 쉽다. (제출 전 검사 규칙은 lib/validate.ts가 맡는다)

import { COLUMNS, type NoticeRow } from "./schema";

/** 한 칸에 들어갈 수 있는 최대 글자 수. 비정상적으로 긴 값을 막는다. */
export const MAX_CELL_LENGTH = 500;

export type SanitizeResult =
  | { ok: true; rows: NoticeRow[] }
  | { ok: false; message: string };

/**
 * 요청에서 받은 행 목록을 NoticeRow 목록으로 바꾼다.
 * - 배열이 아니거나 비어 있으면 거절한다.
 * - 각 행에서 양식의 12개 열 값만 꺼낸다. 다른 이름의 값은 버린다.
 * - 값은 글자만 허용한다. 비어 있거나 없는 칸은 빈 글자("")로 둔다.
 */
export function sanitizeRows(input: unknown, maxRows: number): SanitizeResult {
  if (!Array.isArray(input)) {
    return { ok: false, message: "제출할 행 목록이 없어요." };
  }
  if (input.length === 0) {
    return { ok: false, message: "제출할 행이 없어요." };
  }
  if (input.length > maxRows) {
    return { ok: false, message: `한 번에 ${maxRows.toLocaleString()}건까지 제출할 수 있어요.` };
  }

  const rows: NoticeRow[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const item: unknown = input[index];
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return { ok: false, message: `${index + 2}행의 모양이 맞지 않아요.` };
    }

    const record = {} as Record<string, string>;
    for (const column of COLUMNS) {
      const value = (item as Record<string, unknown>)[column.key];
      if (value === undefined || value === null) {
        record[column.key] = "";
      } else if (typeof value === "string") {
        if (value.length > MAX_CELL_LENGTH) {
          return { ok: false, message: `${index + 2}행 ${column.label} 칸의 값이 너무 길어요.` };
        }
        record[column.key] = value;
      } else {
        return { ok: false, message: `${index + 2}행 ${column.label} 칸의 값이 글자가 아니에요.` };
      }
    }
    rows.push(record as NoticeRow);
  }

  return { ok: true, rows };
}

/** 처음 오류 행 수(통계용)를 0 이상 정수로 정리한다. 이상한 값이면 0. */
export function sanitizeCount(value: unknown, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), max);
}
