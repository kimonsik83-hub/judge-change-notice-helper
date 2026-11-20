// Design Ref: §2.2 취합 담당자 흐름 — "입력된 값만 통지서 양식에 채운다. 없는 값은 비우고 '확인 필요' 표시".
// Plan: 작업 10번 — 제출된 전체 대상을 워드(.docx) 문서 1개에 표로 만든다 (PRD: 워드 문서 1개에 대상 전체를 표로).
//
// ★ 통지서 견본이 아직 없어서 "예시 양식"으로 만들었다: 제목 + 안내 문구 + 회차·작성일·총 건수 + 12개 열 표(연번 포함) + "끝."
//   견본이 생기면 이 파일의 TITLE, INTRO_TEXT, CLOSING_TEXT, WIDTHS(열 폭), buildNoticeDocument 안의 머리글 문구만 바꾸면 된다.
//
// ★ 메모리 때문에 두 단계로 만든다:
//   docx 라이브러리로 행마다 객체를 만들면 5,000건에 메모리 1.5GB를 써서 서버가 버티지 못한다.
//   그래서 문서의 뼈대(제목, 표 머리글, 쪽 설정)는 라이브러리로 만들어 검증된 구조를 그대로 쓰고,
//   수천 개의 본문 행만 같은 모양의 글자(XML)로 직접 만들어 끼워 넣는다 (5,000건 약 0.1초, 메모리 수십 MB).
//   직접 만든 행은 라이브러리가 만드는 행과 글자 하나까지 같아야 하며, 시험으로 비교해 확인한다.
// 이 파일은 순수한 문서 만들기 코드라서 서버 어디서든 시험할 수 있다 (DB 조회는 lib/collect.ts가 맡는다).

import {
  AlignmentType,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import JSZip from "jszip";
import { COLUMNS, type ColumnKey, type NoticeRow } from "./schema";
import { validateRows } from "./validate";

/** 불확실한 값 자리에 적는 문구 (PRD 5번: 비워 두고 "확인 필요"로 표시) */
export const REVIEW_TEXT = "확인 필요";

/** 통지서 한 번에 넣을 수 있는 최대 건수. 문서를 메모리에서 만들기 때문에 상한을 둔다. */
export const MAX_NOTICE_ROWS = 30000;

/** 문서 제목 */
const TITLE = "심판관 변경 통지서";

/** 예시 양식의 안내 문구 (실제 견본이 생기면 이 두 줄만 바꾼다) */
const INTRO_TEXT = "아래와 같이 심판관이 변경되었음을 통지합니다.";
const CLOSING_TEXT = "끝.";

/** 표의 열 폭(단위: twip). 연번 다음에 양식의 12개 열을 PRD 순서대로 넣는다. 합계가 쪽 너비 안에 들어오게 맞췄다. */
const WIDTHS: Record<ColumnKey, number> = {
  caseNumber: 1900,
  noticeFlag: 800,
  oldPanel: 1200,
  newPanel: 1200,
  oldJudge: 1200,
  newJudge: 1200,
  investigator: 1000,
  meeting1: 1100,
  meeting2: 1100,
  meeting3: 1100,
  onHold: 900,
  decision: 1300,
};
const SERIAL_WIDTH = 700;
const FONT = "맑은 고딕";
/** 본문 행을 한 번에 글자로 만들어 바이트로 바꾸는 단위(건수) */
const BODY_CHUNK = 1000;
/** 표 글자 크기(반 포인트 단위: 15 = 7.5pt). 열이 13개라 작게 둔다. */
const TABLE_FONT_SIZE = 15;

export interface NoticeInput {
  readonly roundName: string;
  readonly createdAt: Date;
  /** 통지서에 넣을 모든 행 (이미 정렬된 순서 그대로 연번을 매긴다) */
  readonly rows: readonly NoticeRow[];
}

export interface NoticeProblems {
  /** "확인 필요"로 표시할 칸. 키는 `${행 위치(0부터)}:${열 이름}` */
  readonly reviewCells: ReadonlySet<string>;
  /** 같은 사건번호가 둘 이상 있는 행 수 (이게 0이 아니면 통지서를 만들지 않는다) */
  readonly duplicateRowCount: number;
}

/**
 * 합친 전체 행을 한 번 더 검사해서 문제를 찾는다. (제출 때 이미 검사했지만, 통지서에 잘못된 값이 그대로 들어가지 않게 마지막으로 확인한다.)
 * - 필수 값이 비었거나 형식이 틀린 칸은 "확인 필요"로 표시한다.
 * - 중복은 표시로 해결할 수 없으므로 개수만 알려준다.
 */
export function findNoticeProblems(rows: readonly NoticeRow[]): NoticeProblems {
  const result = validateRows(rows);
  const reviewCells = new Set<string>();
  let duplicateRowCount = 0;
  for (const issue of result.issues) {
    if (issue.type === "duplicate") {
      duplicateRowCount += 1;
      continue;
    }
    // validateRows의 행 번호는 엑셀 기준(2부터)이라 위치(0부터)로 바꾼다
    reviewCells.add(`${issue.row - 2}:${issue.column}`);
  }
  return { reviewCells, duplicateRowCount };
}

/** 문서에 쓰는 날짜(한국 시간, 2026-11-20 모양) */
export function formatNoticeDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 내려받는 파일 이름. 회차 이름에서 파일 이름에 못 쓰는 글자를 뺀다. */
export function noticeFileName(roundName: string): string {
  const safe = roundName
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 40);
  return `변경통지서_${safe || "회차"}.docx`;
}

/**
 * 한 칸의 글자를 문서에 넣기 좋게 정리한다.
 * - 줄바꿈은 공백 하나로 (표 한 칸이 여러 줄로 늘어나 모양이 깨지지 않게)
 * - XML에 쓸 수 없는 제어 문자는 뺀다 (남기면 워드가 문서를 못 연다)
 */
export function cleanCellText(value: string): string {
  return value.replace(XML_ILLEGAL_CHARS, "").replace(LINE_BREAKS, " ");
}

// 소스 파일에 특수 문자를 직접 적으면 편집기나 도구가 줄바꿈으로 바꿔 버릴 수 있어서, 번호로 만들어 쓴다.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
/** 줄바꿈으로 취급되는 글자들 */
const LINE_BREAKS = new RegExp(`[\\r\\n${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}]+`, "g");
/** XML 1.0에서 쓸 수 없는 글자들 (탭·줄바꿈 제외한 제어 문자와 U+FFFE, U+FFFF) */
const XML_ILLEGAL_CHARS = new RegExp(
  `[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f${String.fromCharCode(0xfffe)}${String.fromCharCode(0xffff)}]`,
  "g",
);

// ──────────────────────────────────────────────────────────────
// 본문 행 만들기 (라이브러리가 만드는 행과 같은 모양의 글자)
// ──────────────────────────────────────────────────────────────

const BORDER_XML =
  '<w:tcBorders><w:top w:val="single" w:color="999999" w:sz="4"/><w:left w:val="single" w:color="999999" w:sz="4"/>' +
  '<w:bottom w:val="single" w:color="999999" w:sz="4"/><w:right w:val="single" w:color="999999" w:sz="4"/></w:tcBorders>';
const MARGIN_XML =
  '<w:tcMar><w:top w:type="dxa" w:w="30"/><w:left w:type="dxa" w:w="50"/>' +
  '<w:bottom w:type="dxa" w:w="30"/><w:right w:type="dxa" w:w="50"/></w:tcMar>';
const REVIEW_SHADE_XML = '<w:shd w:fill="FFF2CC" w:color="auto" w:val="clear"/>';
const NORMAL_RUN_PROPS = `<w:rPr><w:b w:val="false"/><w:bCs w:val="false"/><w:sz w:val="${TABLE_FONT_SIZE}"/><w:szCs w:val="${TABLE_FONT_SIZE}"/></w:rPr>`;
const REVIEW_RUN_PROPS = `<w:rPr><w:b/><w:bCs/><w:color w:val="C00000"/><w:sz w:val="${TABLE_FONT_SIZE}"/><w:szCs w:val="${TABLE_FONT_SIZE}"/></w:rPr>`;

/** XML에서 특별한 뜻을 가진 글자를 안전한 표기로 바꾼다 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function bodyCellXml(text: string, width: number, review: boolean): string {
  const run =
    text === ""
      ? ""
      : `<w:r>${review ? REVIEW_RUN_PROPS : NORMAL_RUN_PROPS}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
  return (
    `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${width}"/>${BORDER_XML}${review ? REVIEW_SHADE_XML : ""}${MARGIN_XML}` +
    `<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="left"/></w:pPr>${run}</w:p></w:tc>`
  );
}

/** 본문 한 줄(연번 + 12개 열)의 글자를 만든다. index는 0부터. */
export function bodyRowXml(index: number, row: NoticeRow, reviewCells: ReadonlySet<string>): string {
  let cells = bodyCellXml(String(index + 1), SERIAL_WIDTH, false);
  for (const column of COLUMNS) {
    const review = reviewCells.has(`${index}:${column.key}`);
    // 불확실한 값은 그대로 쓰지 않고 비운 자리에 "확인 필요"를 적는다
    cells += bodyCellXml(review ? REVIEW_TEXT : cleanCellText(row[column.key]), WIDTHS[column.key], review);
  }
  return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr>`;
}

// ──────────────────────────────────────────────────────────────
// 뼈대(라이브러리) 만들기
// ──────────────────────────────────────────────────────────────

const thin = { style: "single", size: 4, color: "999999" } as const;
const BORDERS = { top: thin, bottom: thin, left: thin, right: thin } as const;

function headerCell(text: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 30, bottom: 30, left: 50, right: 50 },
    shading: { type: ShadingType.CLEAR, fill: "E7E6E6", color: "auto" },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, size: TABLE_FONT_SIZE, bold: true })],
      }),
    ],
  });
}

/** 통지서(.docx)를 만든다. rows 순서대로 1번부터 연번을 매긴다. */
export async function buildNoticeDocument(input: NoticeInput): Promise<{
  buffer: Buffer;
  rowCount: number;
  reviewCount: number;
}> {
  if (input.rows.length > MAX_NOTICE_ROWS) {
    throw new Error(`통지서는 한 번에 ${MAX_NOTICE_ROWS.toLocaleString()}건까지 만들 수 있어요.`);
  }

  const { reviewCells } = findNoticeProblems(input.rows);
  const columnWidths = [SERIAL_WIDTH, ...COLUMNS.map((column) => WIDTHS[column.key])];

  const headerRow = new TableRow({
    tableHeader: true, // 쪽이 넘어가도 머리글 줄이 다시 나온다
    cantSplit: true,
    children: [headerCell("연번", SERIAL_WIDTH), ...COLUMNS.map((column) => headerCell(column.label, WIDTHS[column.key]))],
  });

  const infoLines = [
    `회차: ${cleanCellText(input.roundName)}`,
    `작성일: ${formatNoticeDate(input.createdAt)}`,
    `총 ${input.rows.length.toLocaleString("ko-KR")}건`,
  ];
  if (reviewCells.size > 0) {
    infoLines.push(`확인 필요 ${reviewCells.size.toLocaleString("ko-KR")}칸 (표에서 노란 칸으로 표시했어요)`);
  }

  // 머리글 줄만 있는 표로 뼈대를 만든다 (본문 행은 아래에서 끼워 넣는다)
  const skeleton = new Document({
    creator: "심판관 변경통지서 작성 도우미",
    title: `${TITLE} - ${cleanCellText(input.roundName)}`,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 850, bottom: 850, left: 850, right: 850 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: TITLE, bold: true, size: 36 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: INTRO_TEXT, size: 22 })],
          }),
          ...infoLines.map(
            (line) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: line, size: 20 })] }),
          ),
          new Paragraph({ spacing: { after: 120 }, children: [] }),
          new Table({
            layout: TableLayoutType.FIXED,
            width: { size: columnWidths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
            columnWidths,
            rows: [headerRow],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 200 },
            children: [new TextRun({ text: CLOSING_TEXT, size: 20 })],
          }),
        ],
      },
    ],
  });

  const zip = await JSZip.loadAsync(await Packer.toBuffer(skeleton));
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("통지서 뼈대를 만들지 못했어요.");
  const skeletonXml = await documentFile.async("string");

  // 표가 끝나기 직전(</w:tbl>)에 본문 행들을 끼워 넣는다. 표는 하나뿐이다.
  const tableEnd = skeletonXml.lastIndexOf("</w:tbl>");
  if (tableEnd < 0) throw new Error("통지서 뼈대에서 표를 찾지 못했어요.");
  // 행을 1,000개씩 바이트로 바꿔 모은다. 거대한 글자 하나를 통째로 이어 붙이면 같은 내용이 여러 번 복사돼서 메모리를 많이 쓴다.
  const parts: Buffer[] = [Buffer.from(skeletonXml.slice(0, tableEnd), "utf8")];
  for (let from = 0; from < input.rows.length; from += BODY_CHUNK) {
    let chunk = "";
    const to = Math.min(from + BODY_CHUNK, input.rows.length);
    for (let index = from; index < to; index += 1) chunk += bodyRowXml(index, input.rows[index], reviewCells);
    parts.push(Buffer.from(chunk, "utf8"));
  }
  parts.push(Buffer.from(skeletonXml.slice(tableEnd), "utf8"));
  zip.file("word/document.xml", Buffer.concat(parts));

  return {
    buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }),
    rowCount: input.rows.length,
    reviewCount: reviewCells.size,
  };
}
