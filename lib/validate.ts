// Design Ref: §2.1 담당자 흐름, §2.3 검사 규칙 — 업로드 엑셀 검사 규칙을 화면과 무관한 순수 함수로 만든다.
// Plan: 작업 2번 — 필수 누락, 사건번호 중복, 열 이름(양식) 검사.
// Plan SC: 필수 누락은 빠짐없이 전부 표시, 같은 사건번호는 중복 표시, 원본 값은 고치지 않고 위치(행 번호)만 알려준다.
//
// 형식 오류(작업 2번 보강): 통지여부는 Y/N, 회의개최는 실제 있는 날짜, 심판관·조사관은 한 칸에 한 명.
// 사건번호·심판부·보류·의결은 정해진 모양이 없어서 모양 검사를 하지 않는다 (PRD 5번).

import {
  COLUMNS,
  FLAG_VALUES,
  REQUIRED_COLUMNS,
  type ColumnDef,
  type ColumnKey,
  type NoticeRow,
} from "./schema";

/** 엑셀에서 첫 번째 데이터 줄의 행 번호. 1행은 머리글이라 데이터는 2행부터 시작한다. */
export const FIRST_DATA_ROW = 2;

/** 문제의 종류 */
export type IssueType = "missingRequired" | "invalidFormat" | "duplicate";

/** 검사에서 찾은 문제 하나 (한 행의 한 열 기준) */
export interface Issue {
  /** 문제 종류 */
  readonly type: IssueType;
  /** 엑셀에서 보이는 행 번호 (머리글이 1행) */
  readonly row: number;
  /** 문제가 있는 열 */
  readonly column: ColumnKey;
  /** 그 행의 사건번호 (비어 있으면 빈 글자) */
  readonly caseNumber: string;
  /** 사람이 읽는 설명 */
  readonly message: string;
  /** 중복일 때, 같은 사건번호가 나온 다른 행 번호들 */
  readonly otherRows?: readonly number[];
}

/** 열 이름(머리글) 검사 결과 */
export interface HeaderCheck {
  /** 양식에는 있는데 파일에는 없는 열 이름 */
  readonly missing: readonly string[];
  /** 파일에는 있는데 양식에는 없는 열 이름 (참고용, 오류로 막지는 않는다) */
  readonly unknown: readonly string[];
}

/** 검사 결과 전체 */
export interface ValidationResult {
  /** 찾은 문제 전체. 행 번호 순서이고, 같은 행에서는 필수 누락, 형식 오류, 중복 순이다. */
  readonly issues: readonly Issue[];
  /** 검사한 전체 건수 */
  readonly totalRows: number;
  /** 문제가 하나라도 있는 행의 수 */
  readonly errorRowCount: number;
  /** 필수 누락 문제의 수 */
  readonly missingCount: number;
  /** 형식 오류 문제의 수 */
  readonly formatCount: number;
  /** 중복 문제의 수 (중복에 걸린 행 수) */
  readonly duplicateCount: number;
}

/** 값이 비어 있는지. 공백만 있는 칸도 빈 칸으로 본다. */
function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/**
 * 실제 있는 날짜인지 확인한다. 2026-11-20, 2026.11.20, 2026/11/20 모양을 받는다.
 * 구분 기호는 한 날짜 안에서 같아야 하고, 2026-02-30처럼 없는 날짜는 거부한다.
 */
export function isValidDate(value: string): boolean {
  const match = /^(\d{4})([-./])(\d{1,2})\2(\d{1,2})$/.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** 한 칸에 여러 명을 적었는지 (쉼표, 세미콜론, 슬래시, 줄바꿈으로 구분한 경우) */
function hasMultiplePeople(value: string): boolean {
  return /[,，;；、/\n\r]/.test(value);
}

/** 값이 비어 있지 않을 때 열의 종류에 맞는지 확인한다. 맞으면 undefined, 아니면 안내 문구 */
function formatProblem(column: ColumnDef, value: string): string | undefined {
  const text = value.trim();
  switch (column.kind) {
    case "flag":
      return FLAG_VALUES.includes(text.toUpperCase() as (typeof FLAG_VALUES)[number])
        ? undefined
        : `${column.label} 칸에는 ${FLAG_VALUES.join(" 또는 ")}만 쓸 수 있어요.`;
    case "date":
      return isValidDate(text)
        ? undefined
        : `${column.label} 칸에는 2026-11-20 같은 실제 날짜를 적어주세요.`;
    case "person":
      return hasMultiplePeople(value)
        ? `${column.label} 칸에는 한 명만 적어주세요.`
        : undefined;
    default:
      return undefined;
  }
}

/**
 * 엑셀 머리글이 양식과 맞는지 확인한다.
 * 필수가 아닌 열도 양식의 일부이므로 빠져 있으면 missing에 담는다.
 */
export function checkHeaders(headers: readonly string[]): HeaderCheck {
  const found = new Set(headers.map((header) => header.trim()));
  const expected = new Set<string>(COLUMNS.map((column) => column.label));

  return {
    missing: COLUMNS.filter((column) => !found.has(column.label)).map(
      (column) => column.label,
    ),
    unknown: [...found].filter((label) => label !== "" && !expected.has(label)),
  };
}

/**
 * 업로드된 행들을 검사한다.
 * - 필수 6개 열이 비어 있으면 열마다 하나씩, 빠짐없이 모두 표시한다.
 * - 같은 사건번호가 2회 이상 나오면 나온 모든 행을 서로의 행 번호와 함께 표시한다.
 * - 입력 행은 읽기만 하고 절대 고치지 않는다.
 */
export function validateRows(rows: readonly NoticeRow[]): ValidationResult {
  const issues: Issue[] = [];

  // 사건번호별로 어느 행들에 나왔는지 모은다 (앞뒤 공백은 무시, 빈 사건번호는 제외)
  const rowsByCaseNumber = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const caseNumber = row.caseNumber.trim();
    if (caseNumber === "") return;
    const sheetRow = index + FIRST_DATA_ROW;
    const list = rowsByCaseNumber.get(caseNumber);
    if (list) list.push(sheetRow);
    else rowsByCaseNumber.set(caseNumber, [sheetRow]);
  });

  rows.forEach((row, index) => {
    const sheetRow = index + FIRST_DATA_ROW;
    const caseNumber = row.caseNumber.trim();

    // 필수 누락: 빠진 열을 모두 각각 표시한다
    for (const column of REQUIRED_COLUMNS) {
      if (isBlank(row[column.key as ColumnKey])) {
        issues.push({
          type: "missingRequired",
          row: sheetRow,
          column: column.key as ColumnKey,
          caseNumber,
          message: `${column.label} 칸이 비어 있어요.`,
        });
      }
    }

    // 형식 오류: 비어 있지 않은 칸만 본다 (빈 칸은 필수 누락 규칙이 따로 본다)
    for (const column of COLUMNS) {
      const value = row[column.key as ColumnKey];
      if (isBlank(value)) continue;
      const problem = formatProblem(column, value);
      if (problem) {
        issues.push({
          type: "invalidFormat",
          row: sheetRow,
          column: column.key as ColumnKey,
          caseNumber,
          message: problem,
        });
      }
    }

    // 중복: 같은 사건번호가 나온 다른 행들을 함께 알려준다
    const sameRows = caseNumber === "" ? undefined : rowsByCaseNumber.get(caseNumber);
    if (sameRows && sameRows.length > 1) {
      const otherRows = sameRows.filter((other) => other !== sheetRow);
      issues.push({
        type: "duplicate",
        row: sheetRow,
        column: "caseNumber",
        caseNumber,
        message: `사건번호가 ${otherRows.join(", ")}행과 같아요.`,
        otherRows,
      });
    }
  });

  return {
    issues,
    totalRows: rows.length,
    errorRowCount: new Set(issues.map((issue) => issue.row)).size,
    missingCount: issues.filter((issue) => issue.type === "missingRequired").length,
    formatCount: issues.filter((issue) => issue.type === "invalidFormat").length,
    duplicateCount: issues.filter((issue) => issue.type === "duplicate").length,
  };
}
