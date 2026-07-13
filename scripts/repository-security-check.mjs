import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const failures = [];

for (const file of tracked) {
  if (!existsSync(file)) continue;
  const normalized = file.replaceAll("\\", "/");
  if (normalized !== ".env.example" && /(^|\/)\.env(?:\.|$)/i.test(normalized)) {
    failures.push(`${file}: 不允许跟踪环境密钥文件`);
  }
  if (/登录账号说明|admin[-_ ]?credentials?|production[-_ ]?credentials?/i.test(normalized)) {
    failures.push(`${file}: 不允许跟踪账号/凭证说明文件`);
  }

  if (![".html", ".ts", ".tsx", ".js", ".mjs", ".json", ".yml", ".yaml", ".sh", ".md", ".txt", ".example"].includes(extname(file).toLowerCase())) {
    continue;
  }

  const content = readFileSync(file, "utf8");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
    failures.push(`${file}: 检测到私钥内容`);
  }
  if (/<input\b[^>]*type=["']password["'][^>]*value=["'][^"']+["']/i.test(content)
    || /<input\b[^>]*value=["'][^"']+["'][^>]*type=["']password["']/i.test(content)) {
    failures.push(`${file}: 密码输入框不允许预填值`);
  }
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, trackedFilesChecked: tracked.length }, null, 2));
