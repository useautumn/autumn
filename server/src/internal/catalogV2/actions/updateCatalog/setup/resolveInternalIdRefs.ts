import {
	type ProductKey,
	products,
	type UpdateCatalogParams,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** Every `internal_id` the payload states, on plans and on nested variants. */
export const statedInternalIds = ({
	params,
}: {
	params: UpdateCatalogParams;
}): string[] => [
	...new Set(
		(params.plans ?? []).flatMap((plan) => [
			...(plan.internal_id ? [plan.internal_id] : []),
			...(plan.variants ?? []).flatMap((variant) =>
				variant.internal_id ? [variant.internal_id] : [],
			),
		]),
	),
];

export type InternalIdRefs = Map<string, ProductKey>;

/**
 * Resolve stated ids to `(plan_id, version)` BEFORE setup loads anything.
 *
 * Setup scopes its `listFull` by the plan ids in the payload, so a renamed row
 * — the case internal_id exists for — names a plan that does not exist yet and
 * its row would never load. This runs first so those rows are in scope, and so
 * downstream matching never has to carry an id.
 */
export const resolveInternalIdRefs = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
}): Promise<InternalIdRefs> => {
	const internalIds = statedInternalIds({ params });
	if (internalIds.length === 0) return new Map();

	const rows = await ctx.db
		.select({
			internalId: products.internal_id,
			planId: products.id,
			version: products.version,
		})
		.from(products)
		.where(
			and(
				eq(products.org_id, ctx.org.id),
				eq(products.env, ctx.env),
				inArray(products.internal_id, internalIds),
			),
		);

	const refs: InternalIdRefs = new Map(
		rows.map((row) => [
			row.internalId,
			{ planId: row.planId, version: row.version },
		]),
	);

	// An id nothing owns names a new resource: the entry falls back to its
	// plan_id, the row is minted fresh, and the config takes the real id back.
	return refs;
};
