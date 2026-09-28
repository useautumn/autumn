import {
	AppEnv,
	organizations,
	type RevenueCatOAuthConfig,
} from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Writes only the env's RevenueCat oauth key, and only if it still holds `expectedRefreshToken`. */
export const swapRevenueCatOAuth = async ({
	db,
	orgId,
	env,
	oauthConfig,
	expectedRefreshToken,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	oauthConfig: RevenueCatOAuthConfig;
	expectedRefreshToken: string;
}): Promise<boolean> => {
	const oauthKey = env === AppEnv.Live ? "oauth" : "sandbox_oauth";

	const updated = await db
		.update(organizations)
		.set({
			processor_configs: sql`jsonb_set(${organizations.processor_configs}, ARRAY['revenuecat', ${oauthKey}]::text[], ${JSON.stringify(oauthConfig)}::jsonb)`,
		})
		.where(
			and(
				eq(organizations.id, orgId),
				sql`${organizations.processor_configs} #>> ARRAY['revenuecat', ${oauthKey}, 'refresh_token']::text[] = ${expectedRefreshToken}`,
			),
		)
		.returning({ id: organizations.id });

	return updated.length > 0;
};
