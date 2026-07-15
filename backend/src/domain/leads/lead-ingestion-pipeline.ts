import { createHash } from "node:crypto";
import type { LeadSourceType } from "../../types.js";

export type LeadIngestionSourceKind = "file" | "web" | "api";
export type LeadIngestionSinkStatus = "created" | "duplicate" | "updated";
export type LeadIngestionPipelineErrorCode =
  | "invalid_record"
  | "secret_rejected"
  | "checkpoint_context_mismatch"
  | "checkpoint_version_unsupported";

export class LeadIngestionPipelineError extends Error {
  constructor(public readonly code: LeadIngestionPipelineErrorCode, message: string) {
    super(message);
    this.name = "LeadIngestionPipelineError";
  }
}

export interface RawLeadIngestionFields {
  company: string;
  website?: string;
  country?: string;
  contact?: string;
  email?: string;
  phone?: string;
  business?: string;
  description?: string;
}

export interface RawLeadIngestionRecord {
  externalId?: string;
  sourceUrl?: string;
  occurredAt?: string;
  fields: RawLeadIngestionFields;
  payload: unknown;
}

export interface LeadIngestionEvidence {
  provider: string;
  sourceKind: LeadIngestionSourceKind;
  externalId: string;
  sourceUrl: string;
  occurredAt: string;
  transformationVersion: string;
  rawPayload: unknown;
}

export interface NormalizedLeadIngestionRecord {
  recordKey: string;
  company: string;
  website: string;
  country: string;
  contact: string;
  email: string;
  phone: string;
  business: string;
  description: string;
  externalId: string;
  sourceUrl: string;
  occurredAt: string;
  evidence: LeadIngestionEvidence;
}

export interface NormalizeLeadRecordOptions {
  provider: string;
  sourceKind: LeadIngestionSourceKind;
  transformationVersion?: string;
  now?: () => string;
}

export interface LeadIngestionPageRequest {
  cursor?: string;
  checkpoint?: Record<string, unknown>;
}

export interface LeadIngestionPage {
  records: RawLeadIngestionRecord[];
  calls: number;
  exhausted: boolean;
  nextCursor?: string;
  nextCheckpoint?: Record<string, unknown>;
}

export interface LeadIngestionConnector {
  id: string;
  sourceKind: LeadIngestionSourceKind;
  fetchPage(request: LeadIngestionPageRequest): Promise<LeadIngestionPage>;
}

export interface LeadIngestionSinkResult {
  status: LeadIngestionSinkStatus;
  leadId: string;
}

export interface LeadIngestionSink {
  ingest(record: NormalizedLeadIngestionRecord, context: LeadIngestionContext): Promise<LeadIngestionSinkResult>;
}

export interface LeadIngestionContext {
  jobId: string;
  ownerId: string;
  teamId: string;
  sourceType: LeadSourceType;
  sourceChannel: string;
  sourceCampaign: string;
}

export interface LeadIngestionCheckpoint {
  version: 1;
  jobId: string;
  contextKey: string;
  provider: string;
  transformationVersion: string;
  cursor?: string;
  connectorCheckpoint?: Record<string, unknown>;
  completedRecordKeys: string[];
  exhausted: boolean;
  updatedAt: string;
}

export interface LeadIngestionCheckpointStore {
  load(jobId: string): Promise<LeadIngestionCheckpoint | undefined>;
  save(checkpoint: LeadIngestionCheckpoint): Promise<void>;
}

export class InMemoryLeadIngestionCheckpointStore implements LeadIngestionCheckpointStore {
  private readonly values = new Map<string, LeadIngestionCheckpoint>();

  async load(jobId: string) {
    const checkpoint = this.values.get(jobId);
    return checkpoint ? structuredClone(checkpoint) : undefined;
  }

  async save(checkpoint: LeadIngestionCheckpoint) {
    this.values.set(checkpoint.jobId, structuredClone(checkpoint));
  }
}

export interface LeadIngestionFailure {
  recordKey?: string;
  externalId?: string;
  code: string;
  message: string;
}

export interface LeadIngestionRunResult {
  status: "completed" | "interrupted" | "paused";
  created: number;
  duplicate: number;
  updated: number;
  skipped: number;
  calls: number;
  pages: number;
  failures: LeadIngestionFailure[];
  checkpoint: LeadIngestionCheckpoint;
  resumedFromCompletedCheckpoint: boolean;
}

export interface LeadIngestionRunOptions {
  context: LeadIngestionContext;
  connector: LeadIngestionConnector;
  sink: LeadIngestionSink;
  checkpoints: LeadIngestionCheckpointStore;
  maxPages?: number;
  transformationVersion?: string;
}

export interface LeadIngestionPipelineOptions {
  now?: () => string;
}

const SECRET_KEY = /(^|_)(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret|private[_-]?key)($|_)/i;

function compact(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function canonicalUrl(value: unknown) {
  const raw = compact(value);
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol)) return "";
    url.username = "";
    url.password = "";
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizePhone(value: unknown) {
  const raw = compact(value);
  if (!raw) return "";
  const leadingPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  return `${leadingPlus ? "+" : ""}${digits}`;
}

function containsSecret(value: unknown, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsSecret(item, seen));
  return Object.entries(value as Record<string, unknown>).some(([key, entry]) =>
    SECRET_KEY.test(key.replace(/([a-z])([A-Z])/g, "$1_$2")) || containsSecret(entry, seen)
  );
}

function hashKey(parts: string[]) {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
}

function identityPart(record: {
  externalId: string;
  website: string;
  email: string;
  phone: string;
  company: string;
  country: string;
}) {
  if (record.externalId) return `external:${record.externalId}`;
  if (record.website) return `website:${new URL(record.website).hostname}`;
  if (record.email) return `email:${record.email}`;
  if (record.phone) return `phone:${record.phone}`;
  return `company:${record.company.toLowerCase()}|${record.country.toLowerCase()}`;
}

export function normalizeLeadRecord(
  raw: RawLeadIngestionRecord,
  options: NormalizeLeadRecordOptions
): NormalizedLeadIngestionRecord {
  if (containsSecret(raw.payload)) {
    throw new LeadIngestionPipelineError("secret_rejected", "Lead source payload contains a secret-like field");
  }
  const company = compact(raw.fields.company);
  if (!company) throw new LeadIngestionPipelineError("invalid_record", "Lead company is required");
  const externalId = compact(raw.externalId);
  const website = canonicalUrl(raw.fields.website);
  const email = compact(raw.fields.email).toLowerCase();
  const phone = normalizePhone(raw.fields.phone);
  const country = compact(raw.fields.country);
  const sourceUrl = canonicalUrl(raw.sourceUrl);
  const occurredAt = compact(raw.occurredAt) || options.now?.() || new Date().toISOString();
  const transformationVersion = options.transformationVersion || "lead-normalizer/v1";
  const base = { externalId, website, email, phone, company, country };
  const recordKey = `leadrec_${hashKey([options.provider, identityPart(base)])}`;
  return {
    recordKey,
    company,
    website,
    country,
    contact: compact(raw.fields.contact),
    email,
    phone,
    business: compact(raw.fields.business),
    description: compact(raw.fields.description),
    externalId,
    sourceUrl,
    occurredAt,
    evidence: {
      provider: options.provider,
      sourceKind: options.sourceKind,
      externalId,
      sourceUrl,
      occurredAt,
      transformationVersion,
      rawPayload: structuredClone(raw.payload)
    }
  };
}

function checkpointContextKey(context: LeadIngestionContext, connector: LeadIngestionConnector) {
  return hashKey([
    context.jobId,
    context.ownerId,
    context.teamId,
    context.sourceType,
    context.sourceChannel,
    context.sourceCampaign,
    connector.id,
    connector.sourceKind
  ]);
}

function failureFrom(error: unknown, raw?: RawLeadIngestionRecord, recordKey?: string): LeadIngestionFailure {
  return {
    recordKey,
    externalId: compact(raw?.externalId) || undefined,
    code: error instanceof LeadIngestionPipelineError ? error.code : "sink_failed",
    message: error instanceof Error ? error.message : "Unknown ingestion failure"
  };
}

export class LeadIngestionPipeline {
  private readonly now: () => string;

  constructor(options: LeadIngestionPipelineOptions = {}) {
    this.now = options.now || (() => new Date().toISOString());
  }

  async run(options: LeadIngestionRunOptions): Promise<LeadIngestionRunResult> {
    const transformationVersion = options.transformationVersion || "lead-normalizer/v1";
    const contextKey = checkpointContextKey(options.context, options.connector);
    const loaded = await options.checkpoints.load(options.context.jobId);
    if (loaded && loaded.version !== 1) {
      throw new LeadIngestionPipelineError("checkpoint_version_unsupported", "Unsupported lead ingestion checkpoint version");
    }
    if (loaded && loaded.contextKey !== contextKey) {
      throw new LeadIngestionPipelineError("checkpoint_context_mismatch", "Lead ingestion checkpoint belongs to another context");
    }
    if (loaded && loaded.provider !== options.connector.id) {
      throw new LeadIngestionPipelineError("checkpoint_context_mismatch", "Lead ingestion checkpoint belongs to another provider");
    }
    const checkpoint: LeadIngestionCheckpoint = loaded || {
      version: 1,
      jobId: options.context.jobId,
      contextKey,
      provider: options.connector.id,
      transformationVersion,
      completedRecordKeys: [],
      exhausted: false,
      updatedAt: this.now()
    };
    if (checkpoint.transformationVersion !== transformationVersion) {
      throw new LeadIngestionPipelineError("checkpoint_context_mismatch", "Lead ingestion transformation version changed");
    }
    if (checkpoint.exhausted) {
      return {
        status: "completed",
        created: 0,
        duplicate: 0,
        updated: 0,
        skipped: 0,
        calls: 0,
        pages: 0,
        failures: [],
        checkpoint,
        resumedFromCompletedCheckpoint: true
      };
    }

    const maxPages = Math.max(1, options.maxPages || 100);
    let created = 0;
    let duplicate = 0;
    let updated = 0;
    let skipped = 0;
    let calls = 0;
    let pages = 0;

    while (pages < maxPages) {
      const pageStartCursor = checkpoint.cursor;
      const pageStartConnectorCheckpoint = checkpoint.connectorCheckpoint;
      const page = await options.connector.fetchPage({
        cursor: pageStartCursor,
        checkpoint: pageStartConnectorCheckpoint ? structuredClone(pageStartConnectorCheckpoint) : undefined
      });
      calls += page.calls;
      pages += 1;
      if (containsSecret(page.nextCheckpoint)) {
        throw new LeadIngestionPipelineError("secret_rejected", "Connector checkpoint contains a secret-like field");
      }

      for (const raw of page.records) {
        let normalized: NormalizedLeadIngestionRecord;
        try {
          normalized = normalizeLeadRecord(raw, {
            provider: options.connector.id,
            sourceKind: options.connector.sourceKind,
            transformationVersion,
            now: this.now
          });
        } catch (error) {
          if (error instanceof LeadIngestionPipelineError && error.code === "secret_rejected") throw error;
          checkpoint.updatedAt = this.now();
          await options.checkpoints.save(checkpoint);
          return {
            status: "interrupted",
            created,
            duplicate,
            updated,
            skipped,
            calls,
            pages,
            failures: [failureFrom(error, raw)],
            checkpoint: structuredClone(checkpoint),
            resumedFromCompletedCheckpoint: false
          };
        }
        if (checkpoint.completedRecordKeys.includes(normalized.recordKey)) {
          skipped += 1;
          continue;
        }
        try {
          const result = await options.sink.ingest(normalized, options.context);
          if (result.status === "created") created += 1;
          else if (result.status === "duplicate") duplicate += 1;
          else updated += 1;
          checkpoint.completedRecordKeys.push(normalized.recordKey);
          checkpoint.updatedAt = this.now();
          await options.checkpoints.save(checkpoint);
        } catch (error) {
          checkpoint.updatedAt = this.now();
          await options.checkpoints.save(checkpoint);
          return {
            status: "interrupted",
            created,
            duplicate,
            updated,
            skipped,
            calls,
            pages,
            failures: [failureFrom(error, raw, normalized.recordKey)],
            checkpoint: structuredClone(checkpoint),
            resumedFromCompletedCheckpoint: false
          };
        }
      }

      checkpoint.cursor = page.nextCursor;
      checkpoint.connectorCheckpoint = page.nextCheckpoint ? structuredClone(page.nextCheckpoint) : undefined;
      checkpoint.completedRecordKeys = [];
      checkpoint.exhausted = page.exhausted;
      checkpoint.updatedAt = this.now();
      await options.checkpoints.save(checkpoint);
      if (page.exhausted) {
        return {
          status: "completed",
          created,
          duplicate,
          updated,
          skipped,
          calls,
          pages,
          failures: [],
          checkpoint: structuredClone(checkpoint),
          resumedFromCompletedCheckpoint: false
        };
      }
    }

    return {
      status: "paused",
      created,
      duplicate,
      updated,
      skipped,
      calls,
      pages,
      failures: [],
      checkpoint: structuredClone(checkpoint),
      resumedFromCompletedCheckpoint: false
    };
  }
}
