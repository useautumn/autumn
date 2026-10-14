import {
	type ProductKey,
	products,
	type UpdateCatalogParams,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

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

	return refs;
};
