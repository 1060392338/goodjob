import { readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const frontend = lock.packages?.frontend;
const xlsx = lock.packages?.["node_modules/xlsx"];
const failures = [];

if (!frontend?.dependencies?.xlsx) failures.push("frontend/package.json 未声明工作簿依赖");
if (!xlsx) failures.push("package-lock.json 缺少 xlsx 锁定项");
if (xlsx && xlsx.version !== "0.20.3") failures.push("工作簿依赖必须锁定到已修复的 xlsx 0.20.3");
if (xlsx && xlsx.resolved !== "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz") {
  failures.push("xlsx 必须来自 ADR-0004 批准的 SheetJS 官方发布地址");
}
if (xlsx && !String(xlsx.integrity || "").startsWith("sha512-")) failures.push("xlsx 锁定项缺少 SHA-512 完整性摘要");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  workbookDependency: "xlsx@" + xlsx.version,
  source: xlsx.resolved,
  integrityPinned: true
}, null, 2));
