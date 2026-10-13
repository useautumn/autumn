import { organizations } from "@autumn/shared";
import { inArray, or } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export type RateLimitOverrideOrg = { id: string; name: string; slug: string };

/** Overrides are stored under an org id or slug; resolves each key to its org. */
export const findRateLimitOverrideOrgs = async ({
	ctx,
	orgKeys,
}: {
	ctx: AutumnContext;
	orgKeys: string[];
}): Promise<Record<string, RateLimitOverrideOrg>> => {
	if (orgKeys.length === 0) return {};

	const orgs = await ctx.db
		.select({
			id: organizations.id,
			name: organizations.name,
			slug: organizations.slug,
		})
		.from(organizations)
		.where(
			or(
				inArray(organizations.id, orgKeys),
				inArray(organizations.slug, orgKeys),
			),
		);

	const orgsByKey: Record<string, RateLimitOverrideOrg> = {};
	for (const orgKey of orgKeys) {
		const org = orgs.find(({ id, slug }) => id === orgKey || slug === orgKey);
		if (org) orgsByKey[orgKey] = org;
	}
	return orgsByKey;
};
