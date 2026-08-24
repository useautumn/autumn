import {
	type AppEnv,
	type Feature,
	type FullOrg,
	features,
	migrationRuns,
	type Organization,
	OrgConfigSchema,
	organizations,
	type PendingMigration,
	productAliases,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { toPlanAliasMap } from "@/internal/catalogV2/productAliases/toPlanAliasMap.js";

export const findFullOrg = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}): Promise<{
	org: Organization;
	features: Feature[];
	pendingMigrations: PendingMigration[];
	fullOrg: FullOrg;
} | null> => {
	const row = await db.query.organizations.findFirst({
		where: eq(organizations.id, orgId),
		with: {
			features: { where: eq(features.env, env) },
			product_aliases: { where: eq(productAliases.env, env) },
			master: true,
			migration_runs: {
				where: and(
					eq(migrationRuns.env, env),
					inArray(migrationRuns.status, ["queued", "running"]),
					eq(migrationRuns.dry_run, false),
					eq(migrationRuns.lazy_run, true),
				),
				with: { migration: true },
			},
		},
	});

	if (!row) return null;

	const cloned = structuredClone(row);
	const {
		features: rawFeatures,
		product_aliases: rawProductAliases,
		migration_runs: rawMigrationRuns,
		master: rawMaster,
		...orgCore
	} = cloned;

	// Drizzle's $inferSelect types features more loosely (e.g. `type: string`,
	// `created_at: number | null`) than the hand-written `Feature` zod shape.
	// Same trade-off as `OrgService.getWithFeatures` — bridged with one cast.
	const orgFeatures = (rawFeatures ?? []) as unknown as Feature[];
	const pendingMigrations: PendingMigration[] = rawMigrationRuns ?? [];
	const planAliases = toPlanAliasMap({ rows: rawProductAliases });

	const master: Organization | null = rawMaster
		? {
				...rawMaster,
				master: null,
				config: OrgConfigSchema.parse(rawMaster.config || {}),
			}
		: null;

	const org: Organization = {
		...orgCore,
		master,
		config: OrgConfigSchema.parse(orgCore.config || {}),
		pendingMigrations,
		planAliases,
	};

	const fullOrg: FullOrg = {
		...org,
		features: orgFeatures,
	};

	return {
		org,
		features: orgFeatures,
		pendingMigrations,
		fullOrg,
	};
};
