import type { DrizzleCli } from "@/db/initDrizzle.js";
import { apiKeyRepo } from "@/internal/dev/repos/index.js";
import { cacheDeploymentRepo } from "../repos/index.js";

/** The key hashes that are not a live secret key of the Atom's own org and env; null when no Atom holds the token hash. */
export const findInvalidAtomKeys = async ({
	db,
	tokenHash,
	keyHashes,
}: {
	db: DrizzleCli;
	tokenHash: string;
	keyHashes: string[];
}): Promise<string[] | null> => {
	const atom = await cacheDeploymentRepo.findByTokenHash({ db, tokenHash });
	if (!atom) return null;
	if (keyHashes.length === 0) return [];
	const validHashes = new Set(
		await apiKeyRepo.listHashes({
			db,
			orgId: atom.orgId,
			env: atom.env,
			hashedKeys: keyHashes,
		}),
	);
	return keyHashes.filter((keyHash) => !validHashes.has(keyHash));
};
