// 엑셀 읽기: 화면에 보이던 값 그대로 읽는지 (앞자리 0이 사라지면 사건번호 오기가 된다)
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { cellToText, parseNoticeWorkbook, zipUncompressedTotal } from "../lib/excel";

const HEAD = ["사건번호", "통지여부", "기존 심판부", "변경 심판부", "기존 심판관", "변경 심판관", "조사관", "회의개최(1차)", "회의개최(2차)", "회의개최(3차)", "보류", "의결"];

async function sheetBytes(fill: (ws: ExcelJS.Worksheet) => void): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(HEAD);
  fill(ws);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("엑셀 읽기", () => {
  it("숫자 서식 0000으로 보이던 사건번호는 앞자리 0을 채워 읽는다", () => {
    expect(cellToText(12, "0000")).toBe("0012");
    expect(cellToText(12345, "0000")).toBe("12345");
    expect(cellToText(12, "General")).toBe("12");
    expect(cellToText(12)).toBe("12");
  });

  it("파일에서 읽을 때도 서식대로 읽는다 (사건번호 칸)", async () => {
    const data = await sheetBytes((ws) => {
      const row = ws.addRow([12, "Y", "1부", "2부", "가", "나"]);
      row.getCell(1).numFmt = "0000";
    });
    const parsed = await parseNoticeWorkbook(data);
    expect(parsed.ok && parsed.rows[0].caseNumber).toBe("0012");
  });

  it("글자로 적은 값은 그대로 읽고, 날짜는 2026-11-20 모양으로 읽는다", async () => {
    const data = await sheetBytes((ws) => {
      ws.addRow(["2026심0012", "Y", "1부", "2부", "가", "나", "", new Date(Date.UTC(2026, 10, 20))]);
    });
    const parsed = await parseNoticeWorkbook(data);
    expect(parsed.ok && parsed.rows[0].caseNumber).toBe("2026심0012");
    expect(parsed.ok && parsed.rows[0].meeting1).toBe("2026-11-20");
  });

  it("압축을 풀면 너무 커지는 파일(압축 폭탄)은 읽기 전에 거절한다", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("big.xml", "0".repeat(120 * 1024 * 1024)); // 120MB지만 압축하면 아주 작다
    const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    expect(bytes.length).toBeLessThan(4 * 1024 * 1024);
    expect(zipUncompressedTotal(new Uint8Array(bytes))).toBeGreaterThan(100 * 1024 * 1024);
    const parsed = await parseNoticeWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(parsed.ok).toBe(false);
  });

  it("정상 파일의 압축 해제 크기는 상한보다 훨씬 작다", async () => {
    const data = await sheetBytes((ws) => ws.addRow(["A-1", "Y", "1부", "2부", "가", "나"]));
    expect(zipUncompressedTotal(new Uint8Array(data))).toBeLessThan(1024 * 1024);
  });

  it("머리글이 다르면 거절하고 빠진 열을 알려준다", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("S").addRow(["사건번호", "엉뚱"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const parsed = await parseNoticeWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    expect(parsed.ok).toBe(false);
  });
});
