import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENVELOPE_PREFIX = "gjsec:v1";
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export type SecretVaultErrorCode =
  | "INVALID_KEY"
  | "INVALID_CIPHERTEXT"
  | "UNKNOWN_KEY"
  | "AUTHENTICATION_FAILED"
  | "ENCRYPTION_FAILED";

export class SecretVaultError extends Error {
  constructor(public readonly code: SecretVaultErrorCode, message: string) {
    super(message);
    this.name = "SecretVaultError";
  }
}

export interface SecretVaultKey {
  id: string;
  material: Buffer;
}

export interface SecretContext {
  purpose: string;
  recordId: string;
  ownerId: string;
  teamId: string;
}

export interface SecretEnvelopeInspection {
  protected: boolean;
  keyId?: string;
  version?: "v1";
}

export interface SecretVault {
  protect(plaintext: string, context: SecretContext): Promise<string>;
  reveal(protectedValue: string, context: SecretContext): Promise<string>;
  inspect(value: string): SecretEnvelopeInspection;
  needsRotation(value: string): boolean;
  primaryKeyId(): string;
}

export interface AesGcmSecretVaultOptions {
  primary: SecretVaultKey;
  decryptionKeys?: SecretVaultKey[];
}

function decodeBase64Url(value: string, label: string) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new SecretVaultError("INVALID_CIPHERTEXT", `${label} 格式无效`);
  }
  try {
    return Buffer.from(value, "base64url");
  } catch {
    throw new SecretVaultError("INVALID_CIPHERTEXT", `${label} 格式无效`);
  }
}

function aad(context: SecretContext) {
  return Buffer.from(JSON.stringify({
    ownerId: context.ownerId,
    purpose: context.purpose,
    recordId: context.recordId,
    teamId: context.teamId
  }), "utf8");
}

function parseEnvelope(value: string) {
  const parts = value.split(":");
  if (parts.length !== 7 || parts[0] !== "gjsec" || parts[1] !== "v1") {
    throw new SecretVaultError("INVALID_CIPHERTEXT", "密文封装格式无效");
  }
  const [, , keyId, ivValue, authTagValue, ciphertextValue, checksumMarker] = parts;
  if (!KEY_ID_PATTERN.test(keyId) || checksumMarker !== "gcm") {
    throw new SecretVaultError("INVALID_CIPHERTEXT", "密文封装元数据无效");
  }
  const iv = decodeBase64Url(ivValue, "IV");
  const authTag = decodeBase64Url(authTagValue, "认证标签");
  const ciphertext = decodeBase64Url(ciphertextValue, "密文");
  if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length < 1) {
    throw new SecretVaultError("INVALID_CIPHERTEXT", "密文封装长度无效");
  }
  return { keyId, iv, authTag, ciphertext };
}

export function parseSecretVaultKey(spec: string): SecretVaultKey {
  const separator = spec.indexOf(":");
  const id = separator > 0 ? spec.slice(0, separator).trim() : "";
  const encoded = separator > 0 ? spec.slice(separator + 1).trim() : "";
  if (!KEY_ID_PATTERN.test(id)) {
    throw new SecretVaultError("INVALID_KEY", "SecretVault Key ID 格式无效");
  }
  let material: Buffer;
  try {
    material = Buffer.from(encoded, "base64");
  } catch {
    throw new SecretVaultError("INVALID_KEY", "SecretVault Key 必须为 Base64");
  }
  if (!encoded || material.length !== 32 || material.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    throw new SecretVaultError("INVALID_KEY", "SecretVault Key 必须是 32 字节 Base64 数据");
  }
  return { id, material };
}

export function isValidSecretVaultKeySpec(spec?: string) {
  if (!spec?.trim()) return false;
  try {
    parseSecretVaultKey(spec.trim());
    return true;
  } catch {
    return false;
  }
}

export function maskSecret(secret: string) {
  if (!secret) return "";
  return secret.length > 4 ? `****${secret.slice(-4)}` : "****";
}

export class AesGcmSecretVault implements SecretVault {
  private readonly keys: Map<string, Buffer>;

  constructor(private readonly options: AesGcmSecretVaultOptions) {
    const allKeys = [options.primary, ...(options.decryptionKeys || [])];
    this.keys = new Map();
    for (const key of allKeys) {
      if (!KEY_ID_PATTERN.test(key.id) || key.material.length !== 32) {
        throw new SecretVaultError("INVALID_KEY", "SecretVault Key 配置无效");
      }
      const existing = this.keys.get(key.id);
      if (existing && !existing.equals(key.material)) {
        throw new SecretVaultError("INVALID_KEY", "相同 Key ID 不能对应不同密钥");
      }
      this.keys.set(key.id, Buffer.from(key.material));
    }
  }

  primaryKeyId() {
    return this.options.primary.id;
  }

  inspect(value: string): SecretEnvelopeInspection {
    if (!value.startsWith("gjsec:")) return { protected: false };
    const envelope = parseEnvelope(value);
    return { protected: true, keyId: envelope.keyId, version: "v1" };
  }

  needsRotation(value: string) {
    const inspection = this.inspect(value);
    return Boolean(inspection.protected && inspection.keyId !== this.primaryKeyId());
  }

  async protect(plaintext: string, context: SecretContext) {
    if (!plaintext) return "";
    try {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", this.options.primary.material, iv);
      cipher.setAAD(aad(context));
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return [
        ENVELOPE_PREFIX,
        this.options.primary.id,
        iv.toString("base64url"),
        authTag.toString("base64url"),
        ciphertext.toString("base64url"),
        "gcm"
      ].join(":");
    } catch (error) {
      if (error instanceof SecretVaultError) throw error;
      throw new SecretVaultError("ENCRYPTION_FAILED", "凭证加密失败");
    }
  }

  async reveal(protectedValue: string, context: SecretContext) {
    if (!protectedValue) return "";
    const envelope = parseEnvelope(protectedValue);
    const key = this.keys.get(envelope.keyId);
    if (!key) {
      throw new SecretVaultError("UNKNOWN_KEY", `凭证使用的 Key ID ${envelope.keyId} 未配置或已吊销`);
    }
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, envelope.iv);
      decipher.setAAD(aad(context));
      decipher.setAuthTag(envelope.authTag);
      return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]).toString("utf8");
    } catch {
      throw new SecretVaultError("AUTHENTICATION_FAILED", "凭证密文认证失败，可能已损坏或上下文不匹配");
    }
  }
}

export function secretVaultFromEnvironment(env: NodeJS.ProcessEnv = process.env): SecretVault {
  const primarySpec = env.GOODJOB_SECRET_VAULT_PRIMARY_KEY?.trim();
  if (!primarySpec) {
    throw new SecretVaultError("INVALID_KEY", "MySQL 凭证持久化必须配置 GOODJOB_SECRET_VAULT_PRIMARY_KEY");
  }
  const decryptionSpecs = (env.GOODJOB_SECRET_VAULT_DECRYPTION_KEYS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new AesGcmSecretVault({
    primary: parseSecretVaultKey(primarySpec),
    decryptionKeys: decryptionSpecs.map(parseSecretVaultKey)
  });
}
