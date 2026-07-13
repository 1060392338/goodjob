import * as XLSX from "xlsx";

export const WORKBOOK_LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxColumns: 128,
  maxCellCharacters: 32_767
} as const;

const SUPPORTED_EXTENSIONS = new Set(["xlsx", "xls", "csv"]);
const DANGEROUS_HEADERS = new Set(["__proto__", "prototype", "constructor"]);

export interface WorkbookReadOptions {
  maxDataRows: number;
  maxColumns?: number;
  maxCellCharacters?: number;
}

export interface WorkbookExportSheet {
  name: string;
  rows?: readonly Record<string, unknown>[];
  headers?: readonly string[];
  columnWidths?: readonly number[];
}

function extensionOf(fileName: string) {
  return fileName.split(".").pop()?.trim().toLowerCase() || "";
}

function assertSupportedExtension(fileName: string) {
  const extension = extensionOf(fileName);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error("仅支持 XLSX、XLS 或 CSV 文件");
  }
  return extension;
}

export function assertWorkbookFile(file: Pick<File, "name" | "size">) {
  assertSupportedExtension(file.name);
  if (file.size <= 0) throw new Error("导入文件不能为空");
  if (file.size > WORKBOOK_LIMITS.maxFileBytes) {
    throw new Error("导入文件不能超过 5 MB");
  }
}

function assertWorkbookSignature(fileName: string, bytes: Uint8Array) {
  const extension = extensionOf(fileName);
  if (extension === "csv") return;
  if (extension === "xlsx") {
    const zipSignature = bytes.length >= 4
      && bytes[0] === 0x50
      && bytes[1] === 0x4b
      && ((bytes[2] === 0x03 && bytes[3] === 0x04)
        || (bytes[2] === 0x05 && bytes[3] === 0x06)
        || (bytes[2] === 0x07 && bytes[3] === 0x08));
    if (!zipSignature) throw new Error("XLSX 文件内容与扩展名不匹配");
  }
  if (extension === "xls") {
    const oleSignature = bytes.length >= 8
      && [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((value, index) => bytes[index] === value);
    if (!oleSignature) throw new Error("XLS 文件内容与扩展名不匹配");
  }
}

function safeCellValue(value: unknown, maxCellCharacters: number): unknown {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") {
    if (value.length > maxCellCharacters) throw new Error("单元格内容不能超过 " + maxCellCharacters + " 个字符");
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value instanceof Date) return value;
  throw new Error("工作簿包含不支持的复杂单元格内容");
}

function safeHeaders(values: readonly unknown[], maxColumns: number, maxCellCharacters: number) {
  if (values.length > maxColumns) throw new Error("工作簿最多支持 " + maxColumns + " 列");
  const counts = new Map<string, number>();
  return values.map((value, index) => {
    const rawHeader = String(safeCellValue(value, maxCellCharacters)).trim();
    const header = rawHeader || "列" + (index + 1);
    if (DANGEROUS_HEADERS.has(header.toLowerCase())) {
      throw new Error("工作簿包含不安全表头：" + header);
    }
    const count = counts.get(header) || 0;
    counts.set(header, count + 1);
    return count ? header + "_" + count : header;
  });
}

export function readWorkbookRowsFromBytes(
  fileName: string,
  data: ArrayBuffer | Uint8Array,
  options: WorkbookReadOptions
): Record<string, unknown>[] {
  assertSupportedExtension(fileName);
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!bytes.byteLength) throw new Error("导入文件不能为空");
  if (bytes.byteLength > WORKBOOK_LIMITS.maxFileBytes) throw new Error("导入文件不能超过 5 MB");
  assertWorkbookSignature(fileName, bytes);

  const maxColumns = options.maxColumns ?? WORKBOOK_LIMITS.maxColumns;
  const maxCellCharacters = options.maxCellCharacters ?? WORKBOOK_LIMITS.maxCellCharacters;
  const isCsv = extensionOf(fileName) === "csv";
  const workbookInput = isCsv ? new TextDecoder("utf-8").decode(bytes) : bytes;
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(workbookInput, {
      type: isCsv ? "string" : "array",
      dense: true,
      sheetRows: options.maxDataRows + 2,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      cellDates: false,
      bookVBA: false
    });
  } catch {
    throw new Error("无法解析工作簿，请确认文件未损坏且格式正确");
  }

  const firstSheetName = workbook.SheetNames[0];
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
  if (!sheet) throw new Error("工作簿不包含可读取的工作表");

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: true
  });
  if (!matrix.length) return [];
  if (matrix.length > options.maxDataRows + 1) {
    throw new Error("工作簿单次最多支持 " + options.maxDataRows + " 行数据");
  }

  const widestRow = matrix.reduce((width, row) => Math.max(width, Array.isArray(row) ? row.length : 0), 0);
  if (widestRow > maxColumns) throw new Error("工作簿最多支持 " + maxColumns + " 列");
  const headers = safeHeaders(matrix[0] || [], maxColumns, maxCellCharacters);
  const rows: Record<string, unknown>[] = [];

  for (const rawRow of matrix.slice(1)) {
    if (!Array.isArray(rawRow)) continue;
    const row = Object.create(null) as Record<string, unknown>;
    let hasValue = false;
    headers.forEach((header, index) => {
      const value = safeCellValue(rawRow[index], maxCellCharacters);
      if (value !== "") hasValue = true;
      row[header] = value;
    });
    if (hasValue) rows.push(row);
  }
  return rows;
}

export async function readWorkbookRows(file: File, options: WorkbookReadOptions) {
  assertWorkbookFile(file);
  return readWorkbookRowsFromBytes(file.name, await file.arrayBuffer(), options);
}

function buildWorkbook(sheets: readonly WorkbookExportSheet[]) {
  if (!sheets.length) throw new Error("至少需要一个工作表");
  const workbook = XLSX.utils.book_new();
  for (const item of sheets) {
    if (!item.name.trim()) throw new Error("工作表名称不能为空");
    const worksheet = item.headers
      ? XLSX.utils.aoa_to_sheet([Array.from(item.headers)])
      : XLSX.utils.json_to_sheet(Array.from(item.rows || []));
    if (item.columnWidths?.length) {
      worksheet["!cols"] = item.columnWidths.map((wch) => ({ wch: Math.max(1, Math.min(80, Math.round(wch))) }));
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, item.name);
  }
  return workbook;
}

export function createWorkbookBytes(sheets: readonly WorkbookExportSheet[], bookType: "xlsx" | "xls" = "xlsx") {
  const output = XLSX.write(buildWorkbook(sheets), { bookType, type: "array", compression: true });
  return new Uint8Array(output as ArrayBuffer);
}

export function downloadWorkbook(fileName: string, sheets: readonly WorkbookExportSheet[]) {
  XLSX.writeFile(buildWorkbook(sheets), fileName, { compression: true });
}
