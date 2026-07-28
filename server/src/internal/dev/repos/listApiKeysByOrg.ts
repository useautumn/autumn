import { type AppEnv, apiKeys } from "@autumn/shared";
import { and, desc, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const MAX_KEYS_PER_ORG = 200;

export const listApiKeysByOrg = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}) => {
	return await db.query.apiKeys.findMany({
		where: and(eq(apiKeys.org_id, orgId), eq(apiKeys.env, env)),
		orderBy: [desc(apiKeys.id)],
		limit: MAX_KEYS_PER_ORG,
	});
};
