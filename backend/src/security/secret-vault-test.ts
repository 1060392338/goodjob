import assert from "node:assert/strict";
import { runtimeConfigurationIssues } from "../runtime-config.js";
import {
  AesGcmSecretVault,
  SecretVaultError,
  maskSecret,
  parseSecretVaultKey
} from "./secret-vault.js";
import {
  credentialSecretContext,
  decodeCredentialSecret,
  protectCredentialSecret,
  protectCredentialRecords
} from "./credential-secret-storage.js";

const keyOne = Buffer.alloc(32, 1).toString("base64");
const keyTwo = Buffer.alloc(32, 2).toString("base64");
const firstVault = new AesGcmSecretVault({ primary: parseSecretVaultKey(`key-1:${keyOne}`) });
const context = credentialSecretContext("ai-model", "ai-1", "user-1", "team-1");
const otherTenantContext = credentialSecretContext("ai-model", "ai-1", "user-2", "team-2");

const protectedValue = await firstVault.protect("sk-test-secret-value", context);
assert.ok(protectedValue.startsWith("gjsec:v1:key-1:"));
assert.equal(protectedValue.includes("sk-test-secret-value"), false);
assert.equal(await firstVault.reveal(protectedValue, context), "sk-test-secret-value");
assert.equal(firstVault.inspect(protectedValue).keyId, "key-1");
assert.equal(firstVault.needsRotation(protectedValue), false);

await assert.rejects(
  () => firstVault.reveal(protectedValue, otherTenantContext),
  (error: unknown) => error instanceof SecretVaultError && error.code === "AUTHENTICATION_FAILED"
);

const tampered = `${protectedValue.slice(0, -1)}${protectedValue.endsWith("A") ? "B" : "A"}`;
await assert.rejects(
  () => firstVault.reveal(tampered, context),
  (error: unknown) => error instanceof SecretVaultError && ["AUTHENTICATION_FAILED", "INVALID_CIPHERTEXT"].includes(error.code)
);

const rotatedVault = new AesGcmSecretVault({
  primary: parseSecretVaultKey(`key-2:${keyTwo}`),
  decryptionKeys: [parseSecretVaultKey(`key-1:${keyOne}`)]
});
assert.equal(await rotatedVault.reveal(protectedValue, context), "sk-test-secret-value");
assert.equal(rotatedVault.needsRotation(protectedValue), true);

const rotated = await decodeCredentialSecret(protectedValue, context, rotatedVault);
assert.equal(rotated.plaintext, "sk-test-secret-value");
assert.equal(rotated.action, "rotate");
assert.equal(rotated.protectedValue.includes("sk-test-secret-value"), false);
assert.equal(rotatedVault.inspect(rotated.protectedValue).keyId, "key-2");

const revokedVault = new AesGcmSecretVault({ primary: parseSecretVaultKey(`key-2:${keyTwo}`) });
await assert.rejects(
  () => revokedVault.reveal(protectedValue, context),
  (error: unknown) => error instanceof SecretVaultError && error.code === "UNKNOWN_KEY"
);

const migrated = await decodeCredentialSecret("legacy-plaintext-key", context, firstVault);
assert.equal(migrated.action, "migrate");
assert.equal(migrated.plaintext, "legacy-plaintext-key");
assert.equal(migrated.protectedValue.includes("legacy-plaintext-key"), false);
const repeated = await decodeCredentialSecret(migrated.protectedValue, context, firstVault);
assert.equal(repeated.action, "none");
assert.equal(repeated.plaintext, "legacy-plaintext-key");
assert.equal(repeated.protectedValue, migrated.protectedValue);

const newlyProtected = await protectCredentialSecret("source-test-key", credentialSecretContext("lead-source", "source-1", "user-1", "team-1"), firstVault);
assert.equal(newlyProtected.includes("source-test-key"), false);
const persistenceValues = await protectCredentialRecords("ai-model", [{
  id: "ai-persist-1",
  apiKey: "persisted-test-key",
  ownerId: "user-1",
  teamId: "team-1"
}], firstVault);
const persistedValue = persistenceValues.get("ai-persist-1") || "";
assert.equal(persistedValue.includes("persisted-test-key"), false);
assert.equal(
  await firstVault.reveal(persistedValue, credentialSecretContext("ai-model", "ai-persist-1", "user-1", "team-1")),
  "persisted-test-key"
);
assert.equal(maskSecret("source-test-key"), "****-key");
assert.equal(maskSecret("abc"), "****");
assert.equal(maskSecret(""), "");

const missingVaultIssues = runtimeConfigurationIssues({
  NODE_ENV: "production",
  CRM_STORE: "mysql",
  DATABASE_URL: "mysql://goodjob:strong-password@db.internal:3306/goodjob_crm",
  JWT_SECRET: "a-production-secret-that-is-longer-than-thirty-two-characters",
  CORS_ORIGINS: "https://crm.example.com",
  SESSION_COOKIE_SECURE: "true"
});
assert.ok(missingVaultIssues.some((issue) => issue.code === "SECRET_VAULT_KEY_REQUIRED"));

const configuredVaultIssues = runtimeConfigurationIssues({
  NODE_ENV: "production",
  CRM_STORE: "mysql",
  DATABASE_URL: "mysql://goodjob:strong-password@db.internal:3306/goodjob_crm",
  JWT_SECRET: "a-production-secret-that-is-longer-than-thirty-two-characters",
  CORS_ORIGINS: "https://crm.example.com",
  SESSION_COOKIE_SECURE: "true",
  GOODJOB_SECRET_VAULT_PRIMARY_KEY: `key-2:${keyTwo}`
});
assert.equal(configuredVaultIssues.some((issue) => issue.code === "SECRET_VAULT_KEY_REQUIRED"), false);
assert.equal(configuredVaultIssues.some((issue) => issue.code === "SECRET_VAULT_KEY_INVALID"), false);

const invalidVaultIssues = runtimeConfigurationIssues({
  NODE_ENV: "production",
  CRM_STORE: "mysql",
  DATABASE_URL: "mysql://goodjob:strong-password@db.internal:3306/goodjob_crm",
  JWT_SECRET: "a-production-secret-that-is-longer-than-thirty-two-characters",
  CORS_ORIGINS: "https://crm.example.com",
  SESSION_COOKIE_SECURE: "true",
  GOODJOB_SECRET_VAULT_PRIMARY_KEY: "broken-key"
});
assert.ok(invalidVaultIssues.some((issue) => issue.code === "SECRET_VAULT_KEY_INVALID"));

console.log("SecretVault tests passed: encryption, context isolation, tamper detection, migration, rotation, revocation, masking and production gate.");
