import type { SecretContext, SecretVault } from "./secret-vault.js";

export type CredentialSecretKind = "ai-model" | "lead-source";
export type CredentialSecretAction = "none" | "migrate" | "rotate";

export interface DecodedCredentialSecret {
  plaintext: string;
  protectedValue: string;
  action: CredentialSecretAction;
}

export function credentialSecretContext(
  kind: CredentialSecretKind,
  recordId: string,
  ownerId: string,
  teamId: string
): SecretContext {
  return {
    purpose: `${kind}:api-key`,
    recordId,
    ownerId,
    teamId
  };
}

export async function protectCredentialSecret(plaintext: string, context: SecretContext, vault: SecretVault) {
  return plaintext ? vault.protect(plaintext, context) : "";
}

export async function decodeCredentialSecret(
  storedValue: string,
  context: SecretContext,
  vault: SecretVault
): Promise<DecodedCredentialSecret> {
  if (!storedValue) return { plaintext: "", protectedValue: "", action: "none" };

  const inspection = vault.inspect(storedValue);
  if (!inspection.protected) {
    return {
      plaintext: storedValue,
      protectedValue: await vault.protect(storedValue, context),
      action: "migrate"
    };
  }

  const plaintext = await vault.reveal(storedValue, context);
  if (!vault.needsRotation(storedValue)) {
    return { plaintext, protectedValue: storedValue, action: "none" };
  }
  return {
    plaintext,
    protectedValue: await vault.protect(plaintext, context),
    action: "rotate"
  };
}

export interface CredentialSecretRecord {
  id: string;
  apiKey: string;
  ownerId: string;
  teamId: string;
}

export async function protectCredentialRecords(
  kind: CredentialSecretKind,
  records: CredentialSecretRecord[],
  vault: SecretVault
) {
  return new Map(await Promise.all(records.map(async (record) => [
    record.id,
    await protectCredentialSecret(
      record.apiKey,
      credentialSecretContext(kind, record.id, record.ownerId, record.teamId),
      vault
    )
  ] as const)));
}
