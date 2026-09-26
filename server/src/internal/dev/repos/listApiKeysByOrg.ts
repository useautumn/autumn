import { type AppEnv, apiKeys } from "@autumn/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const MAX_KEYS_PER_ORG = 200;

export const listApiKeysByOrg = async ({
	db,
	orgId,
	env,
	visibility,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	visibility: "visible" | "hidden";
}) => {
	if (visibility === "hidden") {
		return await db.query.apiKeys.findMany({
			columns: {
				id: true,
				name: true,
				prefix: true,
				created_at: true,
				env: true,
				meta: true,
				scopes: true,
			},
			where: and(
				eq(apiKeys.org_id, orgId),
				eq(apiKeys.env, env),
				sql`${apiKeys.meta}->>'visibility' = ${"superuser"}`,
			),
			orderBy: [desc(apiKeys.id)],
			limit: MAX_KEYS_PER_ORG,
		});
	}

	return await db.query.apiKeys.findMany({
		where: and(
			eq(apiKeys.org_id, orgId),
			eq(apiKeys.env, env),
			sql`COALESCE(${apiKeys.meta}->>'visibility', '') != ${"superuser"}`,
		),
		orderBy: [desc(apiKeys.id)],
		limit: MAX_KEYS_PER_ORG,
	});
};
