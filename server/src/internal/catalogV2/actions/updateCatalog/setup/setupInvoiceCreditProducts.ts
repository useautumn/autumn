import {
	entitlements,
	type FullProduct,
	products,
	type UpdateCatalogParams,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { ProductService } from "@/internal/products/ProductService.js";

/**
 * Loads every persisted plan version that references a feature being enabled
 * for invoice credits. Catalog validation overlays same-call plan changes on
 * these rows so feature-only updates and atomic feature/plan updates both see
 * the final catalog state.
 */
export const setupInvoiceCreditProducts = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
}): Promise<FullProduct[]> => {
	const internalFeatureIds = (params.features ?? []).flatMap((entry) => {
		if (entry.invoice_credit !== true) return [];
		const feature = ctx.features.find(
			(candidate) => candidate.id === entry.feature_id,
		);
		return feature?.internal_id ? [feature.internal_id] : [];
	});

	if (internalFeatureIds.length === 0) return [];

	const referencedPlans = await ctx.db
		.selectDistinct({ planId: products.id })
		.from(entitlements)
		.innerJoin(
			products,
			eq(entitlements.internal_product_id, products.internal_id),
		)
		.where(
			and(
				inArray(entitlements.internal_feature_id, internalFeatureIds),
				eq(products.org_id, ctx.org.id),
				eq(products.env, ctx.env),
			),
		);

	const planIds = referencedPlans.map(({ planId }) => planId);
	if (planIds.length === 0) return [];

	return ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: planIds,
		returnAll: true,
		skipCache: true,
	});
};
