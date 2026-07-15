import { readFileSync } from "node:fs";

const prototype = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const bootstrap = readFileSync(new URL("./bootstrap.ts", import.meta.url), "utf8");
const apiLayer = readFileSync(new URL("./prototype-api.ts", import.meta.url), "utf8");
const dashboardChart = readFileSync(new URL("./dashboard-chart.ts", import.meta.url), "utf8");
const leadSourceCenter = readFileSync(new URL("./lead-source-center.ts", import.meta.url), "utf8");
const implementationSources = [prototype, bootstrap, apiLayer, dashboardChart, leadSourceCenter];

const required = [
  "login-screen",
  "todo-board",
  "report-deck",
  "id=\"knowledge\"",
  "id=\"exam\"",
  "id=\"tools\"",
  "id=\"settings\"",
  "/src/bootstrap.ts",
  "import(\"./prototype-api\")",
  "import(\"./workbook\")",
  "import(\"./dashboard-chart\")",
  "/api/auth/login",
  "/api/dashboard/summary",
  "DASHBOARD_LIVE_REFRESH_MS",
  "refreshVisibleDashboard",
  "requestDashboardRefresh",
  "/api/knowledge/assets",
  "/api/exams",
  "/api/tools/ocr/jobs/ocr1/sync-lead",
  "/api/lead-finder/providers",
  "/api/lead-finder/search",
  "/api/lead-finder/source-config",
  "createLeadSourceCenterClient",
  "defaultSelectedLeadSourceIds",
  "/conversion-preview",
  "转为客户",
  "createDeal",
  "pipelineAmount",
  "/api/leads?trash=true",
  "sourceEvents",
  "leadPermanentConfirmInput",
  "加入线索中心",
  "leadSourceCenterButton",
  "leadSourceChips",
  "openLeadSourceCenter",
  "ai_search",
  "data-view=\"commission\"",
  "id=\"commission\"",
  "commissionSyncDealsButton",
  "commissionRecalculateButton",
  "/api/commission/products",
  "/api/commission/sales-records",
  "/api/commission/calculations/recalculate",
  "renderCommission"
];

for (const token of required) {
  if (!implementationSources.some((content) => content.includes(token))) throw new Error(`missing ${token}`);
}

if (!prototype.includes(".report-hero") || !prototype.includes(".ocr-workbench") || !prototype.includes(".account-grid")) {
  throw new Error("missing high fidelity prototype styles");
}

console.log(JSON.stringify({ ok: true, checked: required.length }, null, 2));
