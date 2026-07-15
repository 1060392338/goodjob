import { createHash } from "node:crypto";
import { readWorkbookDocumentFromBytes } from "@goodjob/workbook-security";
import type {
  LeadIngestionConnector,
  LeadIngestionPage,
  LeadIngestionPageRequest,
  RawLeadIngestionFields,
  RawLeadIngestionRecord
} from "../domain/leads/lead-ingestion-pipeline.js";

export type FileLeadMappedField = keyof RawLeadIngestionFields | "externalId" | "sourceUrl" | "occurredAt";
export type FileLeadInvalidRowPolicy = "reject_batch" | "skip_invalid";

export interface FileLeadMapping {
  version: string;
  columns: Partial<Record<FileLeadMappedField, string>> & { company: string };
}

export interface FileLeadValidationIssue {
  rowNumber: number;
  code: "company_required" | "mapping_column_missing";
  field: string;
  message: string;
}

export interface FileLeadValidationReport {
  fileName: string;
  fileDigest: string;
  batchId: string;
  sheetName: string;
  mappingVersion: string;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  issues: FileLeadValidationIssue[];
}

export type FileLeadConnectorErrorCode = "batch_validation_failed" | "checkpoint_context_mismatch" | "invalid_cursor";

export class FileLeadConnectorValidationError extends Error {
  constructor(public readonly code: FileLeadConnectorErrorCode, message: string, public readonly report?: FileLeadValidationReport) {
    super(message);
    this.name = "FileLeadConnectorValidationError";
  }
}

export interface FileLeadIngestionConnectorOptions {
  fileName: string;
  bytes: ArrayBuffer | Uint8Array;
  mapping: FileLeadMapping;
  batchId: string;
  id?: string;
  pageSize?: number;
  maxDataRows?: number;
  maxColumns?: number;
  maxCellCharacters?: number;
  invalidRowPolicy?: FileLeadInvalidRowPolicy;
}

interface PreparedFileLead {
  rowNumber: number;
  record: RawLeadIngestionRecord;
}

const SECRET_HEADER = /(^|[._ -])(api[._ -]?key|access[._ -]?token|refresh[._ -]?token|authorization|password|secret|private[._ -]?key)($|[._ -])/i;
const FORMULA_PREFIX = /^\s*(?:[=@]|[+-](?:cmd\b|powershell\b|hyperlink\s*\(|[a-z_][a-z0-9_.]*\s*\())/i;
const CONNECTOR_CHECKPOINT_VERSION = 1;

function text(value: unknown) {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function assertSafeHeaders(headers: readonly string[]) {
  const sensitive = headers.find((header) => SECRET_HEADER.test(header));
  if (sensitive) throw new Error("工作簿包含敏感表头：" + sensitive);
}

function assertNoDangerousFormula(rows: readonly Record<string, unknown>[]) {
  for (let index = 0; index < rows.length; index += 1) {
    for (const [header, value] of Object.entries(rows[index] || {})) {
      if (typeof value === "string" && FORMULA_PREFIX.test(value)) {
        throw new Error("工作簿第 " + (index + 2) + " 行包含危险公式：" + header);
      }
    }
  }
}

function fileDigest(bytes: ArrayBuffer | Uint8Array) {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return createHash("sha256").update(value).digest("hex");
}

function normalizeMapping(mapping: FileLeadMapping) {
  const version = text(mapping.version);
  if (!version) throw new Error("字段映射版本不能为空");
  const columns = Object.create(null) as Record<FileLeadMappedField, string>;
  for (const [field, header] of Object.entries(mapping.columns) as Array<[FileLeadMappedField, string]>) {
    const normalized = text(header);
    if (normalized) columns[field] = normalized;
  }
  if (!columns.company) throw new Error("字段映射必须指定 company 列");
  return { version, columns };
}

function cursorOffset(value: string | undefined, max: number) {
  if (value === undefined || value === "") return 0;
  if (!/^\d+$/.test(value)) throw new FileLeadConnectorValidationError("invalid_cursor", "文件 Connector cursor 必须是非负整数");
  const offset = Number(value);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > max) {
    throw new FileLeadConnectorValidationError("invalid_cursor", "文件 Connector cursor 超出批次范围");
  }
  return offset;
}

export class FileLeadIngestionConnector implements LeadIngestionConnector {
  readonly id: string;
  readonly sourceKind = "file" as const;
  private readonly pageSize: number;
  private readonly invalidRowPolicy: FileLeadInvalidRowPolicy;
  private readonly prepared: PreparedFileLead[];
  private readonly report: FileLeadValidationReport;

  constructor(options: FileLeadIngestionConnectorOptions) {
    const fileName = text(options.fileName);
    const batchId = text(options.batchId);
    if (!fileName) throw new Error("文件名不能为空");
    if (!batchId) throw new Error("批次 ID 不能为空");
    const mapping = normalizeMapping(options.mapping);
    const digest = fileDigest(options.bytes);
    const document = readWorkbookDocumentFromBytes(fileName, options.bytes, {
      maxDataRows: options.maxDataRows ?? 10_000,
      maxColumns: options.maxColumns,
      maxCellCharacters: options.maxCellCharacters
    });
    assertSafeHeaders(document.headers);
    assertNoDangerousFormula(document.rows);
    this.id = text(options.id) || "file-import";
    this.pageSize = Math.max(1, Math.min(500, Math.floor(options.pageSize ?? 100)));
    this.invalidRowPolicy = options.invalidRowPolicy ?? "reject_batch";
    const headerLookup = new Map(document.headers.map((header) => [header.toLowerCase(), header]));
    const companyHeader = headerLookup.get(mapping.columns.company.toLowerCase());
    const issues: FileLeadValidationIssue[] = [];
    if (!companyHeader) {
      issues.push({ rowNumber: 1, code: "mapping_column_missing", field: "company", message: "工作簿缺少 company 映射列：" + mapping.columns.company });
    }
    const prepared: PreparedFileLead[] = [];
    document.rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const value = (field: FileLeadMappedField) => {
        const configured = mapping.columns[field];
        if (!configured) return "";
        const actual = headerLookup.get(configured.toLowerCase());
        return actual ? text(row[actual]) : "";
      };
      const fields: RawLeadIngestionFields = {
        company: value("company"), website: value("website"), country: value("country"), contact: value("contact"),
        email: value("email"), phone: value("phone"), business: value("business"), description: value("description")
      };
      if (!fields.company) {
        issues.push({ rowNumber, code: "company_required", field: "company", message: "第 " + rowNumber + " 行缺少公司名称" });
        return;
      }
      const sourceExternalId = value("externalId");
      const lineage = {
        fileDigest: digest,
        batchId,
        fileName,
        sheetName: document.sheetName,
        rowNumber,
        mappingVersion: mapping.version,
        sourceExternalId
      };
      prepared.push({ rowNumber, record: {
        externalId: sourceExternalId || digest + ":" + document.sheetName + ":" + rowNumber,
        sourceUrl: value("sourceUrl"), occurredAt: value("occurredAt"), fields,
        payload: { lineage, mapped: { ...fields, sourceExternalId } }
      } });
    });
    this.prepared = prepared;
    this.report = {
      fileName, fileDigest: digest, batchId, sheetName: document.sheetName, mappingVersion: mapping.version,
      totalRows: document.rows.length, acceptedRows: prepared.length, rejectedRows: document.rows.length - prepared.length,
      issues
    };
  }

  getValidationReport(): FileLeadValidationReport {
    return structuredClone(this.report);
  }

  async fetchPage(request: LeadIngestionPageRequest): Promise<LeadIngestionPage> {
    if (this.invalidRowPolicy === "reject_batch" && this.report.issues.length) {
      throw new FileLeadConnectorValidationError("batch_validation_failed", "文件批次预检失败，未返回任何线索记录", this.getValidationReport());
    }
    const checkpoint = request.checkpoint;
    if (checkpoint) {
      const expected = {
        version: CONNECTOR_CHECKPOINT_VERSION,
        fileDigest: this.report.fileDigest,
        batchId: this.report.batchId,
        mappingVersion: this.report.mappingVersion,
        sheetName: this.report.sheetName
      };
      for (const [key, value] of Object.entries(expected)) {
        if (checkpoint[key] !== value) {
          throw new FileLeadConnectorValidationError("checkpoint_context_mismatch", "文件 Connector checkpoint 上下文不匹配：" + key);
        }
      }
    }
    const offset = cursorOffset(request.cursor, this.prepared.length);
    if (checkpoint?.nextRowOffset !== undefined && checkpoint.nextRowOffset !== offset) {
      throw new FileLeadConnectorValidationError("checkpoint_context_mismatch", "文件 Connector checkpoint 行偏移与 cursor 不一致");
    }
    const end = Math.min(this.prepared.length, offset + this.pageSize);
    const exhausted = end >= this.prepared.length;
    return {
      records: this.prepared.slice(offset, end).map((item) => structuredClone(item.record)),
      calls: 0,
      exhausted,
      nextCursor: exhausted ? undefined : String(end),
      nextCheckpoint: {
        version: CONNECTOR_CHECKPOINT_VERSION,
        fileDigest: this.report.fileDigest,
        batchId: this.report.batchId,
        mappingVersion: this.report.mappingVersion,
        sheetName: this.report.sheetName,
        nextRowOffset: end
      }
    };
  }
}
