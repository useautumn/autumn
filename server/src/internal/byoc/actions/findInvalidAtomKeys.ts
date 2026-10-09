import { apiKeys } from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { findCacheByTokenHash } from "../repos/cacheDeployments.js";

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
	const atom = await findCacheByTokenHash({ db, tokenHash });
	if (!atom) return null;
	if (keyHashes.length === 0) return [];
	const valid = await db
		.select({ hashedKey: apiKeys.hashed_key })
		.from(apiKeys)
		.where(
			and(
				eq(apiKeys.org_id, atom.orgId),
				eq(apiKeys.env, atom.env),
				inArray(apiKeys.hashed_key, keyHashes),
			),
		);
	const validHashes = new Set(valid.map(({ hashedKey }) => hashedKey));
	return keyHashes.filter((keyHash) => !validHashes.has(keyHash));
};
