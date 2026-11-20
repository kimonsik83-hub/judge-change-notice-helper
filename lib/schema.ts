// Design Ref: §2.3 검사 규칙, §5 폴더 구조 — 업로드 엑셀 12개 열을 이 파일 한 곳에서만 정의한다.
// Plan: 작업 1번 — 열의 이름·종류·필수 여부를 코드로 정의한다.
// 검사 규칙(작업 2번)과 화면, 통지서 작성은 모두 이 정의를 가져다 쓴다.

/**
 * 열의 값 종류 (PRD 5번 형식 기준)
 * - text: 아무 글자 (모양 검사 안 함)
 * - flag: Y 또는 N만 허용
 * - date: 비어 있거나 실제 있는 날짜만 허용
 * - person: 한 칸에 한 명만 허용
 */
export type ColumnKind = "text" | "flag" | "date" | "person";

/** 통지여부처럼 flag 열에서 허용하는 값 (대소문자·앞뒤 공백은 무시) */
export const FLAG_VALUES = ["Y", "N"] as const;

/** 엑셀 열 하나의 정의 */
export interface ColumnDef {
  /** 코드에서 쓰는 이름 (영문) */
  readonly key: string;
  /** 엑셀 맨 윗줄(머리글)에 적혀 있어야 하는 이름 (한글, 양식과 똑같이) */
  readonly label: string;
  /** 값의 종류 */
  readonly kind: ColumnKind;
  /** 필수 여부. 필수 열이 비어 있으면 오류로 표시한다 (PRD 5번) */
  readonly required: boolean;
}

/**
 * 업로드 엑셀 양식의 12개 열. 순서는 PRD 5번의 양식 순서와 같다.
 * 필수 6개: 사건번호, 통지여부, 기존 심판부, 변경 심판부, 기존 심판관, 변경 심판관
 */
export const COLUMNS = [
  { key: "caseNumber", label: "사건번호", kind: "text", required: true },
  { key: "noticeFlag", label: "통지여부", kind: "flag", required: true },
  { key: "oldPanel", label: "기존 심판부", kind: "text", required: true },
  { key: "newPanel", label: "변경 심판부", kind: "text", required: true },
  { key: "oldJudge", label: "기존 심판관", kind: "person", required: true },
  { key: "newJudge", label: "변경 심판관", kind: "person", required: true },
  { key: "investigator", label: "조사관", kind: "person", required: false },
  { key: "meeting1", label: "회의개최(1차)", kind: "date", required: false },
  { key: "meeting2", label: "회의개최(2차)", kind: "date", required: false },
  { key: "meeting3", label: "회의개최(3차)", kind: "date", required: false },
  { key: "onHold", label: "보류", kind: "text", required: false },
  { key: "decision", label: "의결", kind: "text", required: false },
] as const satisfies readonly ColumnDef[];

/** 열 이름(key)의 목록 타입. 예: "caseNumber" | "noticeFlag" | ... */
export type ColumnKey = (typeof COLUMNS)[number]["key"];

/** 엑셀 한 줄(= 변경 대상 한 건). 모든 값은 글자로 다루며, 빈칸은 빈 글자("")로 둔다. */
export type NoticeRow = Record<ColumnKey, string>;

/** 필수 열만 모은 목록 */
export const REQUIRED_COLUMNS: readonly ColumnDef[] = COLUMNS.filter(
  (column) => column.required,
);

/** 엑셀 머리글 이름 → 열 정의. 앞뒤 공백은 무시한다. 양식에 없는 이름이면 undefined */
export function findColumnByLabel(label: string): ColumnDef | undefined {
  const trimmed = label.trim();
  return COLUMNS.find((column) => column.label === trimmed);
}
