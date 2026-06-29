import { ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	type ProductMappingContext,
	buildProductMappingContext,
} from "../catalogMappingUtils.js";

export type ContextsByPlanId = Map<string, ProductMappingContext[]>;

export const loadMappingContexts = async ({
	ctx,
	planIds,
}: {
	ctx: AutumnContext;
	planIds: string[];
}): Promise<ContextsByPlanId> => {
	const { db, org, env, features } = ctx;
	const products = await ProductService.listFull({
		db,
		orgId: org.id,
		env,
		inIds: planIds,
		returnAll: true,
	});

	const productsByPlanId = new Map(
		planIds.map((planId) => {
			const planProducts = products.filter((product) => product.id === planId);
			return [planId, planProducts];
		}),
	);

	for (const [planId, planProducts] of productsByPlanId.entries()) {
		if (planProducts.length > 0) continue;
		throw new RecaseError({
			message: `Plan ${planId} not found`,
			code: ErrCode.ProductNotFound,
			statusCode: 404,
		});
	}

	const contextsByPlanId: ContextsByPlanId = new Map();
	for (const planId of planIds) {
		const planProducts = productsByPlanId.get(planId) ?? [];
		const variants = await ProductService.listVariantsByParent({
			db,
			orgId: org.id,
			env,
			baseInternalProductIds: planProducts.map((product) => product.internal_id),
			returnAll: true,
		});
		const productsByInternalId = new Map(
			[...planProducts, ...variants].map((product) => [
				product.internal_id,
				product,
			]),
		);

		contextsByPlanId.set(
			planId,
			Array.from(productsByInternalId.values()).map((product) =>
				buildProductMappingContext({
					product,
					features,
					currency: org.default_currency || "usd",
				}),
			),
		);
	}

	return contextsByPlanId;
};
