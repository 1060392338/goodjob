import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => existsSync(path.join(root, relativePath));
const failures = [];
const fail = (message) => failures.push(message);
const requireText = (name, content, expected) => {
  if (!content.includes(expected)) fail(`${name} missing: ${expected}`);
};

const packageJson = JSON.parse(read("package.json"));
const features = JSON.parse(read("docs/engineering/FEATURES.json"));
const traceability = read("docs/engineering/TRACEABILITY.md");
const projectStatus = read("docs/engineering/PROJECT_STATUS.md");
const developmentPlan = read("docs/engineering/DEVELOPMENT_PLAN.md");
const handoff = read("docs/engineering/HANDOFF.md");
const riskRegister = read("docs/engineering/RISK_REGISTER.md");
const implementationLog = read("docs/engineering/IMPLEMENTATION_LOG.md");
const phase3Evidence = read("docs/engineering/evidence/L-0021-phase-3-acceptance.md");

const requiredFiles = [
  "docs/engineering/adr/ADR-0016-lead-ingestion-pipeline.md",
  "docs/engineering/adr/ADR-0017-csv-excel-lead-connector.md",
  "docs/engineering/adr/ADR-0018-public-web-search-connector.md",
  "docs/engineering/adr/ADR-0019-third-party-api-provider-boundary.md",
  "docs/engineering/adr/ADR-0020-phase-3-machine-verifiable-acceptance.md",
  "docs/engineering/evidence/L-0017-lead-ingestion-pipeline.md",
  "docs/engineering/evidence/L-0018-csv-excel-lead-connector.md",
  "docs/engineering/evidence/L-0019-public-web-search-connector.md",
  "docs/engineering/evidence/L-0020-third-party-api-provider-boundary.md",
  "docs/engineering/evidence/L-0021-phase-3-acceptance.md",
  "backend/src/domain/leads/lead-ingestion-pipeline.ts",
  "backend/src/connectors/file-lead-ingestion-connector.ts",
  "backend/src/connectors/web-lead-ingestion-connector.ts",
  "backend/src/connectors/api-lead-ingestion-connector.ts"
];
for (const file of requiredFiles) if (!exists(file)) fail(`required phase 3 file missing: ${file}`);

const connectorSources = [
  ["file", read("backend/src/connectors/file-lead-ingestion-connector.ts"), "FileLeadIngestionConnector"],
  ["web", read("backend/src/connectors/web-lead-ingestion-connector.ts"), "WebLeadIngestionConnector"],
  ["api", read("backend/src/connectors/api-lead-ingestion-connector.ts"), "ApiLeadIngestionConnector"]
];
for (const [name, source, className] of connectorSources) {
  requireText(`${name} connector`, source, `class ${className} implements LeadIngestionConnector`);
}
requireText("lead pipeline", read("backend/src/domain/leads/lead-ingestion-pipeline.ts"), "export interface LeadIngestionConnector");

const requiredScripts = [
  "test:pipeline:lead-ingestion",
  "test:connector:file-leads",
  "test:connector:web-leads",
  "test:connector:api-leads"
];
const backendPackage = JSON.parse(read("backend/package.json"));
for (const script of requiredScripts) if (!backendPackage.scripts?.[script]) fail(`backend script missing: ${script}`);
if (!packageJson.scripts?.["test:phase3-acceptance"]) fail("root script missing: test:phase3-acceptance");
if (!packageJson.scripts?.verify?.includes("test:phase3-acceptance")) fail("root verify does not include test:phase3-acceptance");

const lead = features.items.find((item) => item.id === "REQ-GJ-LEAD-001");
if (!lead) fail("REQ-GJ-LEAD-001 missing");
if (lead?.status !== "done") fail(`REQ-GJ-LEAD-001 expected done, received ${lead?.status}`);
if (!lead?.completedAt) fail("REQ-GJ-LEAD-001 missing completedAt");
if (!lead?.verification || typeof lead.verification !== "object") fail("REQ-GJ-LEAD-001 missing structured verification");
for (const loop of ["L-0017", "L-0018", "L-0019", "L-0020", "L-0021"]) {
  const increment = lead?.increments?.find((item) => item.loop === loop);
  if (!increment) fail(`${loop} increment missing`);
  else if (increment.status !== "done") fail(`${loop} expected done, received ${increment.status}`);
}
for (const design of lead?.design || []) if (!exists(design)) fail(`phase 3 design missing: ${design}`);
for (const evidence of lead?.evidence || []) if (!exists(evidence)) fail(`phase 3 evidence missing: ${evidence}`);
for (const increment of lead?.increments || []) {
  for (const key of ["testCommit", "deliveryCommit"]) {
    const value = increment[key];
    if (!value) continue;
    try {
      execFileSync("git", ["cat-file", "-e", `${value}^{commit}`], { cwd: root, stdio: "ignore" });
    } catch {
      fail(`${increment.loop} references unknown ${key} ${value}`);
    }
  }
}

const leadRow = traceability.split(/\r?\n/).find((line) => line.startsWith("| REQ-GJ-LEAD-001 |"));
if (!leadRow?.endsWith("| Done |")) fail("REQ-GJ-LEAD-001 traceability row is not Done");
if (features.currentIteration !== "L-0022") fail(`currentIteration expected L-0022, received ${features.currentIteration}`);
for (const [name, content] of [["PROJECT_STATUS", projectStatus], ["DEVELOPMENT_PLAN", developmentPlan], ["HANDOFF", handoff]]) {
  requireText(name, content, "L-0022");
}

for (const [name, content] of [
  ["FEATURES", JSON.stringify(features)],
  ["PROJECT_STATUS", projectStatus],
  ["DEVELOPMENT_PLAN", developmentPlan],
  ["HANDOFF", handoff],
  ["RISK_REGISTER", riskRegister],
  ["IMPLEMENTATION_LOG", implementationLog],
  ["L-0021 Evidence", phase3Evidence]
]) {
  requireText(name, content, "Accepted with explicit deferred external validation");
}
for (const deferred of ["真实客户", "真实网页", "真实供应商", "真实凭证", "真实数据库"]) {
  requireText("L-0021 Evidence", phase3Evidence, deferred);
}
for (const invariant of ["duplicate writes 0", "credential leaks 0", "真实外呼 0", "37/37", "0 vulnerabilities"]) {
  requireText("L-0021 Evidence", phase3Evidence, invariant);
}
for (const risk of ["R-006", "R-013", "R-015"]) requireText("L-0021 Evidence", phase3Evidence, risk);
requireText("L-0021 Evidence", phase3Evidence, "## 回滚");
requireText("L-0021 Evidence", phase3Evidence, "Test-first Commit");

if (failures.length) {
  console.error("Phase 3 acceptance FAILED");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  phase: 3,
  requirement: "REQ-GJ-LEAD-001",
  loopsAccepted: 5,
  connectors: connectorSources.map(([name]) => name),
  unifiedContract: "LeadIngestionConnector",
  currentIteration: features.currentIteration,
  deferredExternalValidation: true
}, null, 2));
