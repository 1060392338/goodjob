export const WORKBOOK_LIMITS: { readonly maxFileBytes: number; readonly maxColumns: number; readonly maxCellCharacters: number };
export interface WorkbookReadOptions { maxDataRows: number; maxColumns?: number; maxCellCharacters?: number }
export interface WorkbookExportSheet { name: string; rows?: readonly Record<string, unknown>[]; headers?: readonly string[]; columnWidths?: readonly number[] }
export interface WorkbookDocument { sheetName: string; headers: string[]; rows: Record<string, unknown>[] }
export function assertWorkbookFile(file: { name: string; size: number }): void;
export function readWorkbookDocumentFromBytes(fileName: string, data: ArrayBuffer | Uint8Array, options: WorkbookReadOptions): WorkbookDocument;
export function readWorkbookRowsFromBytes(fileName: string, data: ArrayBuffer | Uint8Array, options: WorkbookReadOptions): Record<string, unknown>[];
export function createWorkbookBytes(sheets: readonly WorkbookExportSheet[], bookType?: "xlsx" | "xls"): Uint8Array;
export function downloadWorkbook(fileName: string, sheets: readonly WorkbookExportSheet[]): void;
