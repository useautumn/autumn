import type { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { apiKeyRepo } from "@/internal/dev/repos/index.js";

/** The key hashes that are not a live secret key of the Atom's own org and env. */
export const findInvalidAtomKeys = async ({
	db,
	orgId,
	env,
	keyHashes,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	keyHashes: string[];
}): Promise<string[]> => {
	if (keyHashes.length === 0) return [];
	const validHashes = new Set(
		await apiKeyRepo.listHashes({ db, orgId, env, hashedKeys: keyHashes }),
	);
	return keyHashes.filter((keyHash) => !validHashes.has(keyHash));
};
