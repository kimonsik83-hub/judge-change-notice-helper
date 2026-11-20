// 성공 기준 2·3번: 통지서 건수는 제출 건수와 100% 일치하고, 입력 값이 오기·누락 없이 들어간다.
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildNoticeDocument, findNoticeProblems, REVIEW_TEXT } from "../lib/notice";
import { COLUMNS, type NoticeRow } from "../lib/schema";

function row(n: number, overrides: Partial<NoticeRow> = {}): NoticeRow {
  return {
    caseNumber: `2026심${String(n).padStart(5, "0")}`,
    noticeFlag: n % 7 === 0 ? "N" : "Y",
    oldPanel: `${(n % 9) + 1}부`,
    newPanel: `${((n + 3) % 9) + 1}부`,
    oldJudge: "김기존",
    newJudge: "이변경",
    investigator: n % 5 === 0 ? "" : "박조사",
    meeting1: n % 4 === 0 ? "2026-11-20" : "",
    meeting2: "",
    meeting3: "",
    onHold: n % 11 === 0 ? "A&B <보류>" : "",
    decision: n % 13 === 0 ? '의결 "완료"' : "",
    ...overrides,
  };
}

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** 문서에서 본문 행(연번 + 12개 열)의 글자를 읽어 온다 */
async function readRows(buffer: Buffer): Promise<string[][]> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml
    .split(/<w:tr[ >]/)
    .slice(1)
    .map((tr) =>
      tr
        .split("</w:tc>")
        .slice(0, -1)
        .map((tc) => unescapeXml([...tc.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(""))),
    )
    .slice(1); // 머리글 줄 제외
}

describe("통지서 만들기", () => {
  it("5,000건: 줄 수가 입력 건수와 같고 연번이 1부터 연속이다", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => row(i + 1));
    const doc = await buildNoticeDocument({ roundName: "시험", createdAt: new Date(), rows });
    const out = await readRows(doc.buffer);
    expect(doc.rowCount).toBe(5000);
    expect(out).toHaveLength(5000);
    expect(out.every((r, i) => r[0] === String(i + 1))).toBe(true);
  });

  it("입력 값이 오기·누락 없이 그대로 들어간다 (특수문자 포함)", async () => {
    const rows = Array.from({ length: 300 }, (_, i) => row(i + 1));
    const doc = await buildNoticeDocument({ roundName: "시험", createdAt: new Date(), rows });
    const out = await readRows(doc.buffer);
    rows.forEach((input, i) => {
      COLUMNS.forEach((col, c) => expect(out[i][c + 1]).toBe(input[col.key]));
    });
    expect(doc.reviewCount).toBe(0);
  });

  it("불확실한 값(필수 누락·형식 오류)은 비우고 '확인 필요'로 표시한다", async () => {
    const rows = [row(1), row(2, { oldJudge: "", noticeFlag: "예" }), row(3)];
    const problems = findNoticeProblems(rows);
    expect(problems.reviewCells.size).toBe(2);
    const doc = await buildNoticeDocument({ roundName: "시험", createdAt: new Date(), rows });
    const out = await readRows(doc.buffer);
    expect(out[1][2]).toBe(REVIEW_TEXT); // 통지여부
    expect(out[1][5]).toBe(REVIEW_TEXT); // 기존 심판관
    expect(doc.reviewCount).toBe(2);
  });

  it("담당자 사이 중복 사건번호는 문제로 알려준다 (통지서를 만들지 않는 근거)", () => {
    expect(findNoticeProblems([row(1), row(2, { caseNumber: row(1).caseNumber })]).duplicateRowCount).toBe(2);
  });
});
