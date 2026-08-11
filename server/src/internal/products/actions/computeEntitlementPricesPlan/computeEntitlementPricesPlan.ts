import {
	type AppEnv,
	orgMultiCurrencyEnabled,
	productItemsToEntitlementPrices,
} from "@autumn/shared";
import { planV1ToProductItems } from "@autumn/shared/api/products/mappers/planV1ToProductItems";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { validateProductItems } from "@/internal/products/product-items/validateProductItems.js";
import { buildEntitlementPricesPlan } from "./buildEntitlementPricesPlan/buildEntitlementPricesPlan";
import { claimCurrentRows } from "./claimCurrentRows/claimCurrentRows";
import { carryForwardStripeResources } from "./helpers/carryForwardStripeResources";
import type { ComputeEntitlementPricesPlanParams } from "./types/computeEntitlementPricesPlanParams";
import type { EntitlementPricesPlan } from "./types/entitlementPricesPlan";

/**
 * Claim-based planner: desired basePrice + planItems → price/entitlement write buckets.
 * ProductItem exists only for validate + the shared convert; claim works on EPs.
 */
export const computeEntitlementPricesPlan = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: ComputeEntitlementPricesPlanParams;
}): EntitlementPricesPlan => {
	// Interim: validate still speaks ProductItem. Convert once, then leave it behind.
	const items = planV1ToProductItems({
		ctx,
		plan: {
			price: params.basePrice ?? null,
			items: params.planItems,
		},
	});

	const { allFeatures, newFeatures } = validateProductItems({
		newItems: items,
		features: ctx.features,
		orgId: params.product.org_id!,
		env: params.product.env as AppEnv,
		multiCurrencyEnabled: orgMultiCurrencyEnabled({ org: ctx.org }),
	});

	const desiredBasePriceAndEntitlementPrices = productItemsToEntitlementPrices({
		items,
		product: params.product,
		features: allFeatures,
	});

	const claims = claimCurrentRows({
		params,
		desiredBasePriceAndEntitlementPrices,
	});

	const plan = buildEntitlementPricesPlan({
		mode: params.mode,
		claims,
		newFeatures,
	});

	carryForwardStripeResources({
		plan,
		candidatePrices: params.currentRows?.prices ?? [],
		candidateEntitlements: params.currentRows?.entitlements ?? [],
	});

	plan.projected = {
		prices: [...plan.prices.new, ...plan.prices.updated, ...plan.prices.same],
		entitlements: [
			...plan.entitlements.new,
			...plan.entitlements.updated,
			...plan.entitlements.same,
		],
	};

	return plan;
};
