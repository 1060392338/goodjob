import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const frontendRoot = path.resolve(import.meta.dirname, "..");
const distRoot = path.join(frontendRoot, "dist");
const manifestPath = path.join(distRoot, ".vite", "manifest.json");
const limits = {
  entryBytes: 20 * 1024,
  prototypeBytes: 450 * 1024,
  workbookFeatureBytes: 50 * 1024,
  largestNonVendorBytes: 500 * 1024
};

const failures = [];
const formatKb = (bytes) => `${(bytes / 1000).toFixed(2)} kB`;
const fail = (message) => failures.push(message);

async function fileSize(relativePath) {
  return (await stat(path.join(distRoot, relativePath))).size;
}

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
  const assetsDir = path.join(distRoot, "assets");
  const files = await readdir(assetsDir).catch(() => []);
  const javascript = [];
  for (const file of files.filter((item) => item.endsWith(".js"))) {
    javascript.push({ file, size: (await stat(path.join(assetsDir, file))).size });
  }
  javascript.sort((left, right) => right.size - left.size);
  if (javascript[0]) {
    fail(`monolithic bundle ${javascript[0].file} is ${formatKb(javascript[0].size)}; manifest and lazy feature boundaries are required`);
  } else {
    fail("production JavaScript output is missing");
  }
  fail("Vite manifest is missing: enable build.manifest for repeatable budget inspection");
}

if (manifest) {
  const required = {
    bootstrap: "index.html",
    prototype: "src/prototype-api.ts",
    workbook: "src/workbook.ts",
    dashboardChart: "src/dashboard-chart.ts"
  };
  for (const [label, source] of Object.entries(required)) {
    if (!manifest[source]) fail(`${label} chunk is missing from manifest (${source})`);
  }

  const bootstrap = manifest[required.bootstrap];
  const prototype = manifest[required.prototype];
  const workbook = manifest[required.workbook];
  const dashboardChart = manifest[required.dashboardChart];

  if (bootstrap) {
    if (!bootstrap.isEntry) fail("index.html must emit the production entry chunk");
    const sourceIndexHtml = await readFile(path.join(frontendRoot, "index.html"), "utf8");
    if (!sourceIndexHtml.includes('/src/bootstrap.ts')) fail("index.html must load the lightweight bootstrap source");
    if (!(bootstrap.dynamicImports || []).includes(required.prototype)) fail("bootstrap entry must dynamically import prototype-api");
    const size = await fileSize(bootstrap.file);
    if (size > limits.entryBytes) fail(`bootstrap entry ${formatKb(size)} exceeds ${formatKb(limits.entryBytes)}`);
  }
  if (prototype) {
    if (!prototype.isDynamicEntry) fail("prototype-api must load behind a dynamic boundary");
    const size = await fileSize(prototype.file);
    if (size > limits.prototypeBytes) fail(`prototype feature ${formatKb(size)} exceeds ${formatKb(limits.prototypeBytes)}`);
    const dynamicImports = new Set(prototype.dynamicImports || []);
    for (const source of [required.workbook, required.dashboardChart]) {
      if (!dynamicImports.has(source)) fail(`prototype-api must dynamically import ${source}`);
    }
  }
  if (workbook) {
    if (!workbook.isDynamicEntry) fail("workbook must be a lazy feature chunk");
    const size = await fileSize(workbook.file);
    if (size > limits.workbookFeatureBytes) fail(`workbook feature ${formatKb(size)} exceeds ${formatKb(limits.workbookFeatureBytes)}`);
  }
  if (dashboardChart && !dashboardChart.isDynamicEntry) {
    fail("dashboard chart must be a lazy feature chunk");
  }

  const emittedFiles = Object.values(manifest).map((item) => item.file);
  if (!emittedFiles.some((file) => /vendor-xlsx-.*\.js$/.test(file))) fail("vendor-xlsx lazy chunk is missing");
  if (!emittedFiles.some((file) => /vendor-echarts-.*\.js$/.test(file))) fail("vendor-echarts lazy chunk is missing");
  if (!emittedFiles.some((file) => /vendor-zrender-.*\.js$/.test(file))) fail("vendor-zrender lazy chunk is missing");

  const initialSources = new Set();
  const visitInitial = (source) => {
    if (!source || initialSources.has(source)) return;
    initialSources.add(source);
    for (const imported of manifest[source]?.imports || []) visitInitial(imported);
  };
  visitInitial(required.bootstrap);
  for (const source of initialSources) {
    const file = manifest[source]?.file || "";
    if (/xlsx|echarts|zrender|workbook|dashboard-chart/i.test(file)) {
      fail(`heavy feature leaked into initial graph: ${file}`);
    }
  }

  for (const item of Object.values(manifest)) {
    if (!item.file?.endsWith(".js") || /vendor-(xlsx|echarts|zrender)-/.test(item.file)) continue;
    const size = await fileSize(item.file);
    if (size > limits.largestNonVendorBytes) {
      fail(`non-vendor chunk ${item.file} is ${formatKb(size)}, over ${formatKb(limits.largestNonVendorBytes)}`);
    }
  }

  const indexHtml = await readFile(path.join(distRoot, "index.html"), "utf8");
  const heavyPreload = [...indexHtml.matchAll(/<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((href) => /xlsx|echarts|zrender|workbook|dashboard-chart/i.test(href));
  if (heavyPreload.length) fail(`index.html preloads lazy heavy chunks: ${heavyPreload.join(", ")}`);
}

if (failures.length) {
  console.error("Bundle budget FAILED");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log("Bundle budget PASS");
console.log(`- entry <= ${formatKb(limits.entryBytes)}`);
console.log(`- prototype <= ${formatKb(limits.prototypeBytes)}`);
console.log("- workbook, XLSX and ECharts remain outside the initial graph");
