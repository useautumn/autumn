import { createHash } from "node:crypto";
import type { AppEnv } from "@autumn/shared";

const getSecretFingerprint = ({ secret }: { secret: string }) => {
	if (typeof globalThis.Bun !== "undefined") return Bun.hash(secret).toString();
	return createHash("sha256").update(secret).digest("hex").slice(0, 16);
};

export const buildSecretKeyCacheKey = ({
	orgId,
	env,
	legacyVersion,
	encryptedKey,
}: {
	orgId: string;
	env: AppEnv;
	legacyVersion?: boolean;
	encryptedKey: string;
}): string => {
	return `sk:${orgId}:${env}:${legacyVersion ? 1 : 0}:${encryptedKey}`;
};

export const buildMasterCacheKey = ({
	env,
	accountId,
	legacyVersion,
	secretKey,
}: {
	env?: AppEnv;
	accountId?: string;
	legacyVersion?: boolean;
	secretKey: string;
}): string => {
	return `master:${env || "sandbox"}:${accountId || "none"}:${legacyVersion ? 1 : 0}:${getSecretFingerprint({ secret: secretKey })}`;
};

export const buildPlatformCacheKey = ({
	masterOrgId,
	env,
	accountId,
	legacyVersion,
	encryptedKey,
}: {
	masterOrgId: string;
	env: AppEnv;
	accountId?: string;
	legacyVersion?: boolean;
	encryptedKey: string;
}): string => {
	return `platform:${masterOrgId}:${env}:${accountId || "none"}:${legacyVersion ? 1 : 0}:${encryptedKey}`;
};
