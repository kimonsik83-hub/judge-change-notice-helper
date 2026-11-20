// Design Ref: §2.1 담당자 흐름 [처리 1·2], §6 오류 처리 — 엑셀 파일을 읽어 행 데이터로 바꾸고, 양식(템플릿)을 만든다.
// Plan: 작업 6번 — 업로드된 엑셀을 NoticeRow 목록으로 바꾼다. 검사 규칙 자체는 lib/validate.ts가 맡는다.
// Plan SC: 원본 값은 고치지 않는다. 행 번호는 엑셀에서 보이는 번호와 같아야 하므로 가운데 빈 줄은 지우지 않는다.

import ExcelJS from "exceljs";
import { COLUMNS, FLAG_VALUES, type ColumnKey, type NoticeRow } from "./schema";
import { FIRST_DATA_ROW, checkHeaders } from "./validate";

/** 업로드 크기 제한. Vercel 서버 함수의 요청 크기 제한(4.5MB) 안에 들어오도록 정했다. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
/** 한 번에 검사할 수 있는 최대 건수 (PRD: 수천 건 규모) */
export const MAX_ROWS = 20000;
/** 이 줄 수를 넘는 시트는 읽지 않고 거절한다 (서식만 길게 늘어난 파일로 서버가 느려지는 것을 막는다) */
const MAX_SHEET_ROWS = 100000;

/** 압축을 푼 뒤의 전체 크기 상한 (20,000건 정상 파일은 수 MB 수준이다) */
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

/**
 * zip 파일의 "중앙 디렉터리"를 읽어 압축을 풀었을 때의 크기 합을 계산한다 (실제로 풀지는 않는다).
 * 구조를 읽지 못하면 0을 돌려주고, 그 경우는 아래 xlsx 읽기가 거절한다.
 */
export function zipUncompressedTotal(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 끝에서부터 "끝 기록"(0x06054b50)을 찾는다
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return 0;
  const entries = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  let total = 0;
  for (let n = 0; n < entries; n += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) break;
    total += view.getUint32(offset + 24, true);
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return total;
}

export type ParseResult =
  | {
      ok: true;
      /** 데이터 줄. rows[0]이 엑셀 2행이다. 맨 끝의 빈 줄은 잘라냈다. */
      rows: NoticeRow[];
      /** 양식에 없는 열 이름 (참고용, 검사에는 쓰지 않는다) */
      unknownHeaders: string[];
    }
  | {
      ok: false;
      error: string;
      /** 양식에는 있는데 파일에 없는 열 이름 */
      missingHeaders?: string[];
    };

/** 날짜 칸을 2026-11-20 모양 글자로 바꾼다. 엑셀 날짜는 UTC 자정으로 읽히므로 UTC 기준으로 꺼낸다. */
function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 엑셀 칸의 값을 글자로 바꾼다. 빈 칸은 빈 글자("")다. */
export function cellToText(value: ExcelJS.CellValue, numFmt?: string): string {
  if (value === null || value === undefined) return "";
  // 숫자 칸의 서식이 "0000"처럼 자릿수를 맞추는 모양이면, 화면에 보이던 대로 앞자리 0을 채운다 (예: 12 → 0012)
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && numFmt && /^0{2,}$/.test(numFmt)) {
    return String(value).padStart(numFmt.length, "0");
  }
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return cellToText(value.result as ExcelJS.CellValue); // 수식은 계산된 값을 쓴다
    if ("text" in value && typeof value.text === "string") return value.text; // 하이퍼링크
    return ""; // 오류 값(#N/A 등)
  }
  return String(value);
}

/** 엑셀(.xlsx) 파일 내용을 읽어 행 목록으로 바꾼다. */
export async function parseNoticeWorkbook(data: ArrayBuffer): Promise<ParseResult> {
  const bytes = new Uint8Array(data);
  // .xlsx는 zip 파일이라 맨 앞이 "PK"다
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return { ok: false, error: "엑셀(.xlsx) 파일이 아니에요. 엑셀에서 .xlsx로 저장해 다시 올려주세요." };
  }

  // 압축 폭탄 방어: 압축을 풀면 너무 커지는 파일은 읽기 전에 거절한다 (4MB 안의 파일이 서버 메모리를 다 쓰는 것을 막는다)
  if (zipUncompressedTotal(bytes) > MAX_UNCOMPRESSED_BYTES) {
    return { ok: false, error: "파일 내용이 너무 커요. 불필요한 서식·그림을 지우고 다시 저장해 주세요." };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(data) as unknown as ExcelJS.Buffer);
  } catch {
    return { ok: false, error: "엑셀 파일을 읽지 못했어요. 파일이 깨졌거나 암호가 걸려 있는지 확인해 주세요." };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return { ok: false, error: "엑셀에 시트가 없어요." };
  if (sheet.rowCount > MAX_SHEET_ROWS) {
    return { ok: false, error: `시트가 너무 길어요. (${MAX_SHEET_ROWS.toLocaleString()}줄 이하)` };
  }

  // 1행(머리글)에서 열 이름 → 몇 번째 열인지 찾는다
  const headerRow = sheet.getRow(1);
  const headerTexts: string[] = [];
  const columnIndexByLabel = new Map<string, number>();
  for (let col = 1; col <= sheet.columnCount; col += 1) {
    const label = cellToText(headerRow.getCell(col).value).trim();
    headerTexts.push(label);
    if (label !== "" && !columnIndexByLabel.has(label)) columnIndexByLabel.set(label, col);
  }

  const headerCheck = checkHeaders(headerTexts);
  if (headerCheck.missing.length > 0) {
    return {
      ok: false,
      error: `1행의 열 이름이 양식과 달라요. 빠진 열: ${headerCheck.missing.join(", ")}`,
      missingHeaders: [...headerCheck.missing],
    };
  }

  // 2행부터 데이터 줄을 읽는다
  const rows: NoticeRow[] = [];
  let lastFilled = -1;
  for (let rowNumber = FIRST_DATA_ROW; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const record = {} as Record<ColumnKey, string>;
    let hasValue = false;
    for (const column of COLUMNS) {
      const colIndex = columnIndexByLabel.get(column.label) as number;
      const cell = row.getCell(colIndex);
      const text = cellToText(cell.value, cell.numFmt);
      record[column.key] = text;
      if (text.trim() !== "") hasValue = true;
    }
    rows.push(record);
    if (hasValue) lastFilled = rows.length - 1;
  }

  // 맨 끝의 빈 줄만 자른다. 가운데 빈 줄은 남겨서 행 번호가 엑셀과 같게 유지한다.
  const trimmed = rows.slice(0, lastFilled + 1);
  if (trimmed.length === 0) {
    return { ok: false, error: "데이터가 없어요. 2행부터 변경 대상을 입력해 주세요." };
  }
  if (trimmed.length > MAX_ROWS) {
    return { ok: false, error: `한 번에 ${MAX_ROWS.toLocaleString()}건까지 검사할 수 있어요. (지금 ${trimmed.length.toLocaleString()}건)` };
  }

  return { ok: true, rows: trimmed, unknownHeaders: headerCheck.unknown.slice() };
}

/** 담당자가 내려받아 쓰는 빈 양식(.xlsx)을 만든다. 1행은 양식의 열 이름 그대로다. */
export async function buildTemplateWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet("변경대상");
  sheet.columns = COLUMNS.map((column) => ({
    header: column.label,
    key: column.key,
    width: Math.max(14, column.label.length * 2 + 4),
  }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const header = sheet.getRow(1);
  header.font = { bold: true };
  COLUMNS.forEach((column, index) => {
    // 필수 열은 노란색, 선택 열은 회색으로 구분한다
    header.getCell(index + 1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: column.required ? "FFFFF2CC" : "FFEDEDED" },
    };
  });

  const guide = workbook.addWorksheet("작성 안내");
  guide.columns = [{ width: 24 }, { width: 70 }];
  const lines: Array<[string, string]> = [
    ["필수 열 (노란색)", COLUMNS.filter((column) => column.required).map((column) => column.label).join(", ")],
    ["선택 열 (회색)", COLUMNS.filter((column) => !column.required).map((column) => column.label).join(", ")],
    ["통지여부", `${FLAG_VALUES.join(" 또는 ")}만 적어요.`],
    ["회의개최(1·2·3차)", "비워 두거나 2026-11-20 같은 날짜를 적어요."],
    ["심판관, 조사관", "한 칸에 한 명만 적어요. 여러 명이면 줄을 나눠요."],
    ["사건번호", "같은 사건번호를 두 번 적지 않아요."],
    ["1행", "열 이름을 바꾸거나 지우지 마세요. 데이터는 2행부터 적어요."],
  ];
  lines.forEach(([name, text]) => guide.addRow([name, text]));
  guide.getColumn(1).font = { bold: true };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
