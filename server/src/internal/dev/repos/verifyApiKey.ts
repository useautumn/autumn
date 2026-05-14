import { type AppEnv, apiKeys } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { orgRepo } from "@/internal/orgs/repos/index.js";

export const verifyApiKey = async ({
	db,
	hashedKey,
	env,
}: {
	db: DrizzleCli;
	hashedKey: string;
	env: AppEnv;
}) => {
	const apiKey = await db.query.apiKeys.findFirst({
		where: eq(apiKeys.hashed_key, hashedKey),
		with: { user: true },
	});

	if (!apiKey?.org_id) return null;

	const result = await orgRepo.findFull({ db, orgId: apiKey.org_id, env });
	if (!result) return null;

	return {
		org: result.org,
		features: result.features,
		pendingMigrations: result.pendingMigrations,
		fullOrg: result.fullOrg,
		env,
		userId: apiKey.user_id,
		user: apiKey.user ?? null,
		scopes: apiKey.scopes,
	};
};
