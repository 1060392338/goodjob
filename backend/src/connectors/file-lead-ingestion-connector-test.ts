import { strict as assert } from "node:assert";
import { createWorkbookBytes } from "@goodjob/workbook-security";
import {
  FileLeadConnectorValidationError,
  FileLeadIngestionConnector,
  type FileLeadMapping
} from "./file-lead-ingestion-connector.js";
import {
  InMemoryLeadIngestionCheckpointStore,
  LeadIngestionPipeline,
  type LeadIngestionContext,
  type LeadIngestionSink
} from "../domain/leads/lead-ingestion-pipeline.js";

const encoder = new TextEncoder();
const mapping: FileLeadMapping = {
  version: "lead-file-map/v1",
  columns: {
    company: "Company",
    website: "Website",
    country: "Country",
    contact: "Contact",
    email: "Email",
    phone: "Phone",
    business: "Business",
    description: "Description",
    externalId: "External ID",
    sourceUrl: "Source URL",
    occurredAt: "Occurred At"
  }
};
const rows = [
  {
    Company: "Acme GmbH", Website: "https://acme.example/?utm_source=file", Country: "DE",
    Contact: "Anna", Email: "ANNA@ACME.EXAMPLE", Phone: "+49 30 1234", Business: "Lighting",
    Description: "Importer", "External ID": "ext-1", "Source URL": "https://source.example/a?tracking=1",
    "Occurred At": "2026-07-15T01:00:00.000Z"
  },
  {
    Company: "Beta Trading", Website: "beta.example", Country: "US", Contact: "Bob",
    Email: "bob@beta.example", Phone: "+1 212 555 0100", Business: "Distribution",
    Description: "Distributor", "External ID": "ext-2", "Source URL": "https://source.example/b",
    "Occurred At": "2026-07-15T02:00:00.000Z"
  }
];
const csv = encoder.encode([
  Object.keys(rows[0]).join(","),
  Object.values(rows[0]).join(","),
  Object.values(rows[1]).join(",")
].join("\n") + "\n");
const xlsx = createWorkbookBytes([{ name: "Leads", rows }], "xlsx");
const xls = createWorkbookBytes([{ name: "Leads", rows }], "xls");

for (const [fileName, bytes] of [["leads.csv", csv], ["leads.xlsx", xlsx], ["leads.xls", xls]] as const) {
  const connector = new FileLeadIngestionConnector({ fileName, bytes, mapping, batchId: "batch-format", pageSize: 1 });
  const report = connector.getValidationReport();
  assert.equal(report.acceptedRows, 2);
  assert.equal(report.issues.length, 0);
  assert.match(report.fileDigest, /^[a-f0-9]{64}$/);
  const first = await connector.fetchPage({});
  assert.equal(first.records.length, 1);
  assert.equal(first.exhausted, false);
  assert.equal(first.nextCursor, "1");
  assert.equal(first.nextCheckpoint?.mappingVersion, mapping.version);
  const lineage = (first.records[0]?.payload as { lineage: Record<string, unknown> }).lineage;
  assert.equal(lineage.batchId, "batch-format");
  assert.equal(lineage.rowNumber, 2);
  assert.equal(lineage.mappingVersion, mapping.version);
  assert.equal(lineage.fileDigest, report.fileDigest);
  assert.equal(Object.prototype.hasOwnProperty.call(first.records[0]?.payload || {}, "rawRow"), false);
}

const connector = new FileLeadIngestionConnector({ fileName: "leads.xlsx", bytes: xlsx, mapping, batchId: "batch-resume", pageSize: 1 });
const context: LeadIngestionContext = {
  jobId: "file-job-1", ownerId: "owner-1", teamId: "team-1", sourceType: "import",
  sourceChannel: "file-import", sourceCampaign: "phase-3"
};
const persisted = new Map<string, string>();
let sinkCalls = 0;
let failSecondOnce = true;
const sink: LeadIngestionSink = {
  async ingest(record) {
    sinkCalls += 1;
    if (record.company === "Beta Trading" && failSecondOnce) {
      failSecondOnce = false;
      throw new Error("simulated row persistence failure");
    }
    const previous = persisted.get(record.recordKey);
    persisted.set(record.recordKey, record.company);
    return { status: previous ? "duplicate" : "created", leadId: record.recordKey };
  }
};
const pipeline = new LeadIngestionPipeline({ now: () => "2026-07-15T12:00:00.000Z" });
const checkpoints = new InMemoryLeadIngestionCheckpointStore();
const interrupted = await pipeline.run({ context, connector, sink, checkpoints });
assert.equal(interrupted.status, "interrupted");
assert.equal(interrupted.created, 1);
assert.equal(interrupted.failures[0]?.externalId, "ext-2");
const resumed = await pipeline.run({ context, connector, sink, checkpoints });
assert.equal(resumed.status, "completed");
assert.equal(resumed.created, 1);
assert.equal(persisted.size, 2);
assert.equal(sinkCalls, 3);

const rerun = await pipeline.run({
  context: { ...context, jobId: "file-job-2" }, connector, sink,
  checkpoints: new InMemoryLeadIngestionCheckpointStore()
});
assert.equal(rerun.status, "completed");
assert.equal(rerun.created, 0);
assert.equal(rerun.duplicate, 2);
assert.equal(persisted.size, 2);

const invalidCsv = encoder.encode("Company,Email\nValid Ltd,ok@example.com\n,missing@example.com\n");
const rejectBatch = new FileLeadIngestionConnector({ fileName: "invalid.csv", bytes: invalidCsv, mapping, batchId: "batch-reject" });
assert.equal(rejectBatch.getValidationReport().issues[0]?.rowNumber, 3);
await assert.rejects(rejectBatch.fetchPage({}), (error: unknown) =>
  error instanceof FileLeadConnectorValidationError && error.code === "batch_validation_failed"
);

const skipInvalid = new FileLeadIngestionConnector({
  fileName: "invalid.csv", bytes: invalidCsv, mapping, batchId: "batch-skip", invalidRowPolicy: "skip_invalid"
});
const partial = await skipInvalid.fetchPage({});
assert.equal(partial.records.length, 1);
assert.equal(skipInvalid.getValidationReport().rejectedRows, 1);

function expectConnectorFailure(label: string, create: () => unknown, pattern: RegExp) {
  try { create(); throw new Error(label + " did not fail"); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!pattern.test(message)) throw new Error(label + " returned unexpected error: " + message);
  }
}
expectConnectorFailure("prototype header", () => new FileLeadIngestionConnector({
  fileName: "prototype.csv", bytes: encoder.encode("__proto__,Company\nx,Unsafe Ltd\n"), mapping, batchId: "bad-1"
}), /不安全表头/);
expectConnectorFailure("secret header", () => new FileLeadIngestionConnector({
  fileName: "secret.csv", bytes: encoder.encode("Company,api_key\nUnsafe Ltd,secret-value\n"), mapping, batchId: "bad-2"
}), /敏感表头/);
expectConnectorFailure("formula", () => new FileLeadIngestionConnector({
  fileName: "formula.csv", bytes: encoder.encode("Company,Description\nUnsafe Ltd,=HYPERLINK(\"https:\/\/evil.example\")\n"), mapping, batchId: "bad-3"
}), /危险公式/);
expectConnectorFailure("row limit", () => new FileLeadIngestionConnector({
  fileName: "rows.xlsx", bytes: createWorkbookBytes([{ name: "Rows", rows: [{ Company: "A" }, { Company: "B" }, { Company: "C" }] }]),
  mapping, batchId: "bad-4", maxDataRows: 2
}), /最多支持 2 行/);
expectConnectorFailure("signature spoof", () => new FileLeadIngestionConnector({
  fileName: "spoof.xlsx", bytes: encoder.encode("Company\nUnsafe Ltd\n"), mapping, batchId: "bad-5"
}), /扩展名不匹配/);

console.log(JSON.stringify({
  ok: true,
  formats: 3,
  mappedRows: rows.length,
  lineageFields: 5,
  resumedAfterFailure: true,
  duplicateWrites: 0,
  rejectBatchWrites: 0,
  partialFailureReported: true,
  securityRejections: 5,
  realOutboundCalls: 0
}, null, 2));
