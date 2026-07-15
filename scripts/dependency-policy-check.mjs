import { readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const frontend = lock.packages?.frontend;
const backend = lock.packages?.backend;
const xlsx = lock.packages?.["node_modules/xlsx"];
const langgraph = lock.packages?.["node_modules/@langchain/langgraph"];
const langgraphCheckpoint = lock.packages?.["node_modules/@langchain/langgraph-checkpoint"];
const langchainCore = lock.packages?.["node_modules/@langchain/core"];
const zod = lock.packages?.["node_modules/zod"];
const failures = [];

if (!frontend?.dependencies?.xlsx) failures.push("frontend/package.json 未声明工作簿依赖");
if (!xlsx) failures.push("package-lock.json 缺少 xlsx 锁定项");
if (xlsx && xlsx.version !== "0.20.3") failures.push("工作簿依赖必须锁定到已修复的 xlsx 0.20.3");
if (xlsx && xlsx.resolved !== "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz") {
  failures.push("xlsx 必须来自 ADR-0004 批准的 SheetJS 官方发布地址");
}
if (xlsx && !String(xlsx.integrity || "").startsWith("sha512-")) failures.push("xlsx 锁定项缺少 SHA-512 完整性摘要");

if (!backend) failures.push("package-lock.json 缺少 backend workspace 锁定项");
if (backend?.dependencies?.["@langchain/langgraph"] !== "1.4.8") failures.push("LangGraph.js 必须精确锁定为 1.4.8");
if (backend?.dependencies?.["@langchain/core"] !== "1.1.48") failures.push("LangChain Core 必须精确锁定为 1.1.48");
if (backend?.dependencies?.zod !== "3.25.76") failures.push("Zod 必须精确锁定为 3.25.76");
if (langgraph?.version !== "1.4.8") failures.push("package-lock.json 中 LangGraph.js 版本不符合 ADR-0010");
if (langgraphCheckpoint?.version !== "1.1.3") failures.push("LangGraph Checkpoint 必须精确锁定为已审计的 1.1.3");
if (langchainCore?.version !== "1.1.48") failures.push("package-lock.json 中 LangChain Core 版本不符合 ADR-0010");
if (zod?.version !== "3.25.76") failures.push("package-lock.json 中 Zod 版本不符合 ADR-0010");
for (const [name, dependency] of [
  ["LangGraph.js", langgraph],
  ["LangGraph Checkpoint", langgraphCheckpoint],
  ["LangChain Core", langchainCore],
  ["Zod", zod]
]) {
  if (!dependency) failures.push(`package-lock.json 缺少 ${name} 锁定项`);
  else if (!String(dependency.integrity || "").startsWith("sha512-")) failures.push(`${name} 锁定项缺少 SHA-512 完整性摘要`);
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  workbookDependency: "xlsx@" + xlsx.version,
  source: xlsx.resolved,
  integrityPinned: true,
  aiWorkflowDependencies: {
    langgraph: langgraph.version,
    checkpoint: langgraphCheckpoint.version,
    core: langchainCore.version,
    zod: zod.version,
    integrityPinned: true
  }
}, null, 2));
