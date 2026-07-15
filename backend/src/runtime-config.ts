import { isValidSecretVaultKeySpec } from "./security/secret-vault.js";

export interface RuntimeSecurityEnv {
  NODE_ENV?: string;
  CRM_STORE?: string;
  DATABASE_URL?: string;
  MYSQL_URL?: string;
  JWT_SECRET?: string;
  CORS_ORIGINS?: string;
  SESSION_COOKIE_SECURE?: string;
  INITIAL_ADMIN_PASSWORD?: string;
  GOODJOB_SECRET_VAULT_PRIMARY_KEY?: string;
}

export interface RuntimeConfigurationIssue {
  code: string;
  message: string;
}

function configured(value?: string) {
  return Boolean(value?.trim());
}

export function runtimeConfigurationIssues(env: RuntimeSecurityEnv = process.env): RuntimeConfigurationIssue[] {
  if (env.NODE_ENV !== "production") return [];

  const issues: RuntimeConfigurationIssue[] = [];
  const databaseUrl = env.DATABASE_URL?.trim() || env.MYSQL_URL?.trim() || "";
  const jwtSecret = env.JWT_SECRET?.trim() || "";
  const corsOrigins = (env.CORS_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);

  if (env.CRM_STORE === "memory" || !databaseUrl) {
    issues.push({ code: "PRODUCTION_DATABASE_REQUIRED", message: "生产环境必须使用 MySQL，禁止 memory store" });
  }
  if (/change_me|user:password|example/i.test(databaseUrl)) {
    issues.push({ code: "PLACEHOLDER_DATABASE_CREDENTIALS", message: "生产数据库连接仍包含示例或占位凭证" });
  }
  if (jwtSecret.length < 32) {
    issues.push({ code: "JWT_SECRET_REQUIRED", message: "生产环境必须配置至少 32 个字符的 JWT_SECRET" });
  }
  if (!configured(env.GOODJOB_SECRET_VAULT_PRIMARY_KEY)) {
    issues.push({ code: "SECRET_VAULT_KEY_REQUIRED", message: "Production requires a SecretVault primary key for model and lead-source credentials" });
  } else if (!isValidSecretVaultKeySpec(env.GOODJOB_SECRET_VAULT_PRIMARY_KEY)) {
    issues.push({ code: "SECRET_VAULT_KEY_INVALID", message: "SecretVault primary key must use key-id:32-byte-base64 format" });
  }
  if (!corsOrigins.length || corsOrigins.includes("*")) {
    issues.push({ code: "CORS_ORIGINS_REQUIRED", message: "生产环境必须配置明确的 CORS_ORIGINS，禁止通配符" });
  }
  if (env.SESSION_COOKIE_SECURE === "false") {
    issues.push({ code: "SECURE_COOKIE_REQUIRED", message: "生产环境禁止关闭 Secure Cookie" });
  }
  if (configured(env.INITIAL_ADMIN_PASSWORD)
    && (env.INITIAL_ADMIN_PASSWORD || "").length < 12) {
    issues.push({ code: "INITIAL_ADMIN_PASSWORD_WEAK", message: "首次管理员密码至少 12 位" });
  }
  if ((env.INITIAL_ADMIN_PASSWORD || "").toLowerCase().includes("goodjob")) {
    issues.push({ code: "INITIAL_ADMIN_PASSWORD_DEFAULT", message: "首次管理员密码不能使用项目默认测试口令" });
  }

  return issues;
}

export function assertRuntimeConfiguration(env: RuntimeSecurityEnv = process.env) {
  const issues = runtimeConfigurationIssues(env);
  if (issues.length) {
    throw new Error(`运行时安全配置不合格：${issues.map((issue) => `${issue.code}(${issue.message})`).join("；")}`);
  }
}
