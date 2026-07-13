import { strict as assert } from "node:assert";
import {
  WORKBOOK_LIMITS,
  assertWorkbookFile,
  createWorkbookBytes,
  readWorkbookRowsFromBytes
} from "./workbook.js";

function expectFailure(label: string, action: () => unknown, pattern: RegExp) {
  try {
    action();
    throw new Error(label + " did not fail");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!pattern.test(message)) throw new Error(label + " returned unexpected error: " + message);
  }
}

const customerBytes = createWorkbookBytes([{ name: "客户", rows: [{ 公司名: "安全照明有限公司", 国家: "德国", 健康度: 88 }] }]);
const customerRows = readWorkbookRowsFromBytes("customers.xlsx", customerBytes, { maxDataRows: 10 });
assert.equal(customerRows.length, 1);
assert.equal(customerRows[0].公司名, "安全照明有限公司");
assert.equal(customerRows[0].健康度, 88);
assert.equal(Object.getPrototypeOf(customerRows[0]), null);

const legacyBytes = createWorkbookBytes([{ name: "旧版客户", rows: [{ 公司名: "Legacy GmbH", 国家: "德国" }] }], "xls");
const legacyRows = readWorkbookRowsFromBytes("legacy-customers.xls", legacyBytes, { maxDataRows: 10 });
assert.equal(legacyRows[0].公司名, "Legacy GmbH");

const csvBytes = new TextEncoder().encode("公司名,国家\nCSV Trading,美国\n");
const csvRows = readWorkbookRowsFromBytes("customers.csv", csvBytes, { maxDataRows: 10 });
assert.equal(csvRows[0].公司名, "CSV Trading");

assertWorkbookFile({ name: "customers.xlsx", size: customerBytes.byteLength });
expectFailure("unsupported extension", () => assertWorkbookFile({ name: "customers.html", size: 20 }), /仅支持/);
expectFailure("unsupported byte source", () => readWorkbookRowsFromBytes("customers.html", customerBytes, { maxDataRows: 10 }), /仅支持/);
expectFailure("empty file", () => assertWorkbookFile({ name: "customers.xlsx", size: 0 }), /不能为空/);
expectFailure("oversized file", () => assertWorkbookFile({ name: "customers.xlsx", size: WORKBOOK_LIMITS.maxFileBytes + 1 }), /5 MB/);
expectFailure("extension spoofing", () => readWorkbookRowsFromBytes("customers.xls", customerBytes, { maxDataRows: 10 }), /扩展名不匹配/);
expectFailure("malformed workbook", () => readWorkbookRowsFromBytes("broken.xlsx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), { maxDataRows: 10 }), /无法解析/);

const pollutionBefore = ({} as Record<string, unknown>).polluted;
const dangerousCsv = new TextEncoder().encode("__proto__,公司名\npolluted,Unsafe Ltd\n");
expectFailure("dangerous header", () => readWorkbookRowsFromBytes("dangerous.csv", dangerousCsv, { maxDataRows: 10 }), /不安全表头/);
assert.equal(({} as Record<string, unknown>).polluted, pollutionBefore);

const tooManyRows = createWorkbookBytes([{ name: "行数", rows: [{ A: 1 }, { A: 2 }, { A: 3 }] }]);
expectFailure("row limit", () => readWorkbookRowsFromBytes("rows.xlsx", tooManyRows, { maxDataRows: 2 }), /最多支持 2 行/);

const tooManyColumns = createWorkbookBytes([{ name: "列数", headers: ["A", "B", "C"] }]);
expectFailure("column limit", () => readWorkbookRowsFromBytes("columns.xlsx", tooManyColumns, { maxDataRows: 2, maxColumns: 2 }), /最多支持 2 列/);

const longCell = createWorkbookBytes([{ name: "长文本", rows: [{ A: "12345678901" }] }]);
expectFailure("cell limit", () => readWorkbookRowsFromBytes("cell.xlsx", longCell, { maxDataRows: 2, maxCellCharacters: 10 }), /不能超过 10 个字符/);

console.log(JSON.stringify({
  ok: true,
  xlsxRows: customerRows.length,
  xlsRows: legacyRows.length,
  csvRows: csvRows.length,
  prototypeProtected: true,
  limitsProtected: true
}, null, 2));
