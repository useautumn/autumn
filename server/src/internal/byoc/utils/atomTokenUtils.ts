import { createHash, randomBytes } from "node:crypto";
import type { ByocCacheDeployment } from "@autumn/shared";
import { decryptData } from "@/utils/encryptUtils.js";

const ATOM_TOKEN_PREFIX = "atom_";
const ATOM_TOKEN_BYTES = 32;

export const generateAtomToken = (): string =>
	`${ATOM_TOKEN_PREFIX}${randomBytes(ATOM_TOKEN_BYTES).toString("base64url")}`;

export const atomTokenToHash = ({ token }: { token: string }): string =>
	createHash("sha256").update(token).digest("hex");

export const cacheDeploymentToAtomToken = ({
	cacheDeployment,
}: {
	cacheDeployment: ByocCacheDeployment;
}): string => decryptData(cacheDeployment.encrypted_token);
