// 성공 기준 5번: 필수 6개 열이 비면 빠짐없이 전부 표시되고, 같은 사건번호는 중복으로 표시된다.
import { describe, expect, it } from "vitest";
import { REQUIRED_COLUMNS, type NoticeRow } from "../lib/schema";
import { validateRows } from "../lib/validate";

function row(n: number, overrides: Partial<NoticeRow> = {}): NoticeRow {
  return {
    caseNumber: `2026심${String(n).padStart(5, "0")}`,
    noticeFlag: "Y",
    oldPanel: "1부",
    newPanel: "2부",
    oldJudge: "김기존",
    newJudge: "이변경",
    investigator: "",
    meeting1: "",
    meeting2: "",
    meeting3: "",
    onHold: "",
    decision: "",
    ...overrides,
  };
}

describe("엑셀 검사", () => {
  it("정상 행은 오류가 없다", () => {
    expect(validateRows([row(1), row(2)]).issues).toHaveLength(0);
  });

  it("필수 6개 열이 모두 비면 6칸 전부 표시한다 (일부만 표시하지 않는다)", () => {
    const empty = Object.fromEntries(REQUIRED_COLUMNS.map((c) => [c.key, ""])) as Partial<NoticeRow>;
    const result = validateRows([row(1, empty)]);
    expect(result.missingCount).toBe(6);
    expect(new Set(result.issues.map((i) => i.column)).size).toBe(6);
  });

  it("많은 행(5,000건)에서도 누락을 빠짐없이 센다", () => {
    const rows = Array.from({ length: 5000 }, (_, i) => row(i + 1, i % 50 === 0 ? { oldJudge: "" } : {}));
    expect(validateRows(rows).missingCount).toBe(100);
  });

  it("같은 사건번호는 모든 해당 행을 중복으로 표시한다", () => {
    const result = validateRows([row(1), row(2, { caseNumber: row(1).caseNumber }), row(3)]);
    expect(result.duplicateCount).toBe(2);
  });

  it("형식 오류(통지여부 Y/N 아님, 없는 날짜)를 표시한다", () => {
    const result = validateRows([row(1, { noticeFlag: "예" }), row(2, { meeting1: "2026-02-30" })]);
    expect(result.formatCount).toBe(2);
  });

  it("원본 값은 고치지 않는다 (위치만 알려준다)", () => {
    const input = [row(1, { noticeFlag: "예" })];
    validateRows(input);
    expect(input[0].noticeFlag).toBe("예");
  });
});
