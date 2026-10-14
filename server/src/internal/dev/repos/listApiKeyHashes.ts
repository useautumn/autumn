import { type AppEnv, apiKeys } from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const listApiKeyHashes = async ({
	db,
	orgId,
	env,
	hashedKeys,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	hashedKeys: string[];
}) => {
	const rows = await db
		.select({ hashedKey: apiKeys.hashed_key })
		.from(apiKeys)
		.where(
			and(
				eq(apiKeys.org_id, orgId),
				eq(apiKeys.env, env),
				inArray(apiKeys.hashed_key, hashedKeys),
			),
		);
	return rows.map(({ hashedKey }) => hashedKey);
};
