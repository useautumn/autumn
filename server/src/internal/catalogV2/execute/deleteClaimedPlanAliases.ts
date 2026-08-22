import { productAliases } from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** Drop alias rows whose public id this catalog write is claiming. */
export const deleteClaimedPlanAliases = async ({
	ctx,
	aliasIds,
}: {
	ctx: AutumnContext;
	aliasIds: string[];
}): Promise<void> => {
	if (aliasIds.length === 0) return;

	await ctx.db
		.delete(productAliases)
		.where(
			and(
				eq(productAliases.org_id, ctx.org.id),
				eq(productAliases.env, ctx.env),
				inArray(productAliases.alias_id, aliasIds),
			),
		);
};
