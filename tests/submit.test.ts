// 제출 요청의 모양 확인과 수정 이력 계산 (서버가 브라우저 값을 그대로 믿지 않는지)
import { describe, expect, it } from "vitest";
import { applyEdit, diffEdits } from "../lib/edits";
import type { NoticeRow } from "../lib/schema";
import { MAX_CELL_LENGTH, MAX_EDITS, sanitizeEdits, sanitizeRows } from "../lib/submit";

const base: NoticeRow = {
  caseNumber: "A-1", noticeFlag: "Y", oldPanel: "1부", newPanel: "2부", oldJudge: "가", newJudge: "나",
  investigator: "", meeting1: "", meeting2: "", meeting3: "", onHold: "", decision: "",
};

describe("제출 행 정리", () => {
  it("배열이 아니거나 비면 거절한다", () => {
    expect(sanitizeRows("x", 10).ok).toBe(false);
    expect(sanitizeRows([], 10).ok).toBe(false);
  });
  it("최대 건수를 넘으면 거절한다", () => {
    expect(sanitizeRows([base, base, base], 2).ok).toBe(false);
  });
  it("글자가 아닌 값과 너무 긴 값은 거절하고, 양식 밖의 이름은 버린다", () => {
    expect(sanitizeRows([{ ...base, caseNumber: 5 }], 10).ok).toBe(false);
    expect(sanitizeRows([{ ...base, decision: "a".repeat(MAX_CELL_LENGTH + 1) }], 10).ok).toBe(false);
    const ok = sanitizeRows([{ ...base, hack: "x" }], 10);
    expect(ok.ok && "hack" in ok.rows[0]).toBe(false);
  });
});

describe("수정 이력", () => {
  it("원본과 달라진 칸만 이력이 되고, 되돌린 칸은 빠진다", () => {
    const original = [base, { ...base, caseNumber: "A-2" }];
    let rows: readonly NoticeRow[] = original;
    rows = applyEdit(rows, 3, "investigator", " 새조사 ");
    rows = applyEdit(rows, 2, "oldJudge", "다");
    rows = applyEdit(rows, 2, "oldJudge", "가"); // 되돌림
    expect(diffEdits(original, rows)).toEqual([{ row: 3, column: "investigator", oldValue: "" }]);
  });
  it("서버는 이상한 이력 항목(범위 밖 행·없는 열·글자 아님)을 버린다", () => {
    const edits = sanitizeEdits(
      [
        { row: 2, column: "decision", oldValue: "x" },
        { row: 99, column: "decision", oldValue: "x" },
        { row: 2, column: "nope", oldValue: "x" },
        { row: 2, column: "decision", oldValue: 5 },
        null,
      ],
      3,
    );
    expect(edits).toHaveLength(1);
  });
  it("이력은 최대 건수까지만 받는다", () => {
    const many = Array.from({ length: MAX_EDITS + 50 }, () => ({ row: 2, column: "decision", oldValue: "z" }));
    expect(sanitizeEdits(many, 3)).toHaveLength(MAX_EDITS);
  });
});
