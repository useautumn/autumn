import {
	type AppEnv,
	type Feature,
	features,
	type Organization,
	OrgConfigSchema,
	organizations,
	productAliases,
	productAliasesToPlanAliasMap,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { PostgresDb } from "../../types/postgresClient.js";

type OrgWithRelations = Organization & {
	features?: Feature[];
	product_aliases?: { alias_id: string; canonical_plan_id: string }[];
};

/** An org with its env's features and plan aliases; kept line-for-line with the server's OrgService.getWithFeatures. */
export const getOrgWithFeatures = async ({
	ctx,
	orgId,
	env,
}: {
	ctx: { db: PostgresDb };
	orgId: string;
	env: AppEnv;
}): Promise<{ org: Organization; features: Feature[] } | null> => {
	const result = (await ctx.db.query.organizations.findFirst({
		where: eq(organizations.id, orgId),
		with: {
			features: {
				where: eq(features.env, env),
			},
			product_aliases: {
				where: eq(productAliases.env, env),
			},
			master: true,
		},
	})) as OrgWithRelations | undefined;
	if (!result) return null;

	const org = structuredClone(result);
	delete org.features;
	delete org.product_aliases;

	return {
		org: {
			...org,
			config: OrgConfigSchema.parse(org.config || {}),
			planAliases: productAliasesToPlanAliasMap({
				rows: result.product_aliases,
			}),
		},
		features: result.features || [],
	};
};
