import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const features = JSON.parse(read("docs/engineering/FEATURES.json"));
const traceability = read("docs/engineering/TRACEABILITY.md");
const projectStatus = read("docs/engineering/PROJECT_STATUS.md");
const developmentPlan = read("docs/engineering/DEVELOPMENT_PLAN.md");
const handoff = read("docs/engineering/HANDOFF.md");
const failures = [];
const fail = (message) => failures.push(message);

const requiredDocuments = [
  "docs/engineering/FEATURES.json",
  "docs/engineering/TRACEABILITY.md",
  "docs/engineering/PROJECT_STATUS.md",
  "docs/engineering/DEVELOPMENT_PLAN.md",
  "docs/engineering/RISK_REGISTER.md",
  "docs/engineering/HANDOFF.md",
  "docs/engineering/IMPLEMENTATION_LOG.md"
];
for (const document of requiredDocuments) {
  if (!existsSync(path.join(root, document))) fail(`required engineering document missing: ${document}`);
}

const ids = new Set();
const tasks = new Set();
const allowedStatuses = new Set(features.allowedStatuses || []);
for (const item of features.items || []) {
  if (ids.has(item.id)) fail(`duplicate requirement id: ${item.id}`);
  ids.add(item.id);
  if (tasks.has(item.task)) fail(`duplicate task id: ${item.task}`);
  tasks.add(item.task);
  if (!allowedStatuses.has(item.status)) fail(`${item.id} has unsupported status ${item.status}`);
  if (!traceability.includes(`| ${item.id} |`)) fail(`${item.id} is missing from TRACEABILITY.md`);

  for (const design of item.design || []) {
    if (!existsSync(path.join(root, design))) fail(`${item.id} design missing: ${design}`);
  }
  for (const evidence of item.evidence || []) {
    if (!existsSync(path.join(root, evidence))) fail(`${item.id} evidence missing: ${evidence}`);
  }

  if (item.phase === 2 && item.status === "done") {
    if (!item.completedAt) fail(`${item.id} done without completedAt`);
    if (!item.verification || typeof item.verification !== "object") fail(`${item.id} done without structured verification`);
    if (!(item.design || []).length) fail(`${item.id} done without design reference`);
    if (!(item.evidence || []).length) fail(`${item.id} done without evidence reference`);
    const row = traceability.split(/\r?\n/).find((line) => line.startsWith(`| ${item.id} |`));
    if (!row?.endsWith("| Done |")) fail(`${item.id} traceability status is not Done`);
    for (const evidence of item.evidence || []) {
      const content = read(evidence);
      const commit = content.match(/\u5b9e\u73b0 Commit\uff1a`([0-9a-f]{7,40})`/i)?.[1];
      if (!commit) {
        fail(`${item.id} evidence has no implementation commit: ${evidence}`);
        continue;
      }
      try {
        execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: root, stdio: "ignore" });
      } catch {
        fail(`${item.id} evidence references unknown commit ${commit}`);
      }
    }
  }
}

for (const [name, content] of [
  ["PROJECT_STATUS.md", projectStatus],
  ["DEVELOPMENT_PLAN.md", developmentPlan],
  ["HANDOFF.md", handoff]
]) {
  if (!content.includes(features.currentIteration)) fail(`${name} does not mention current iteration ${features.currentIteration}`);
}

for (const relativePath of ["docs/engineering/FEATURES.json", ...requiredDocuments.slice(1)]) {
  const content = read(relativePath);
  if (content.includes("\ufffd")) fail(`${relativePath} contains Unicode replacement characters`);
  if (content.includes("???")) fail(`${relativePath} contains unresolved placeholder text`);
}

if (failures.length) {
  console.error("Engineering traceability FAILED");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

const phase2Done = features.items.filter((item) => item.phase === 2 && item.status === "done").length;
console.log(JSON.stringify({
  ok: true,
  requirements: ids.size,
  tasks: tasks.size,
  phase2Done,
  currentIteration: features.currentIteration
}, null, 2));
