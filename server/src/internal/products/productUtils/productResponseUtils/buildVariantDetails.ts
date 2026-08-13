import {
	type ApiPlanV1,
	diffPlanV1,
	type Feature,
	type FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "../../ProductService.js";
import { getPlanResponse } from "./getPlanResponse.js";

const fetchBaseFullProduct = async ({
	ctx,
	product,
}: {
	ctx?: AutumnContext;
	product: FullProduct;
}): Promise<FullProduct | undefined> => {
	if (!ctx || !product.base_internal_product_id) return undefined;
	return (
		(await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: product.base_internal_product_id,
			orgId: ctx.org.id,
			env: ctx.env,
			allowNotFound: true,
		})) ?? undefined
	);
};

/**
 * A variant plan's up-link to its base: base_plan_id + the customize diff.
 * Base plan sources, in precedence order: pre-rendered basePlan, hydrated
 * baseFullProduct, DB fetch (when resolveBaseFullProduct).
 */
export const buildVariantDetails = async ({
	ctx,
	product,
	plan,
	features,
	expand,
	currency,
	basePlan,
	baseFullProduct,
	resolveBaseFullProduct,
}: {
	ctx?: AutumnContext;
	product: FullProduct;
	plan: ApiPlanV1;
	features: Feature[];
	expand?: string[];
	currency?: string;
	basePlan?: ApiPlanV1;
	baseFullProduct?: FullProduct;
	resolveBaseFullProduct: boolean;
}): Promise<ApiPlanV1["variant_details"]> => {
	const resolvedBaseFullProduct =
		baseFullProduct ??
		(resolveBaseFullProduct
			? await fetchBaseFullProduct({ ctx, product })
			: undefined);
	const resolvedBasePlan =
		basePlan ??
		(resolvedBaseFullProduct
			? await getPlanResponse({
					ctx,
					product: resolvedBaseFullProduct,
					features,
					expand,
					currency,
				})
			: undefined);
	if (!resolvedBasePlan) return undefined;

	const customize = diffPlanV1({ from: resolvedBasePlan, to: plan });
	const hasCustomize = Object.keys(customize).length > 0;

	return {
		base_plan_id: resolvedBasePlan.id,
		...(hasCustomize ? { customize } : {}),
	};
};
