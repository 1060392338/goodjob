import {
  WORKBOOK_LIMITS,
  assertWorkbookFile,
  createWorkbookBytes,
  downloadWorkbook,
  readWorkbookRowsFromBytes,
  type WorkbookExportSheet,
  type WorkbookReadOptions
} from "@goodjob/workbook-security";

export {
  WORKBOOK_LIMITS,
  assertWorkbookFile,
  createWorkbookBytes,
  downloadWorkbook,
  readWorkbookRowsFromBytes
};
export type { WorkbookExportSheet, WorkbookReadOptions };

export async function readWorkbookRows(file: File, options: WorkbookReadOptions) {
  assertWorkbookFile(file);
  return readWorkbookRowsFromBytes(file.name, await file.arrayBuffer(), options);
}
