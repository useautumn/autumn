import {
	applyDiff,
	type Entitlement,
	type FullProduct,
	type LicenseCustomize,
	type Price,
	toCreatePlanItemParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupCustomFullProduct } from "@/internal/billing/v2/setup/setupCustomFullProduct.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

export type LicenseCustomizeComputation = {
	effectiveProduct: FullProduct;
	customPrices: Price[];
	customEntitlements: Entitlement[];
};

/** Junction rows for a customized link: every price (+ its entitlement) and
 * every price-less entitlement of the effective product. Unchanged items keep
 * their stock row ids — only diffed items point at custom rows. */
export const derivePlanLicenseItemRefs = (effectiveProduct: FullProduct) => {
	const priceReferencedEntitlementIds = new Set(
		effectiveProduct.prices
			.map((price) => price.entitlement_id)
			.filter((id): id is string => Boolean(id)),
	);
	return [
		...effectiveProduct.prices.map((price) => ({
			entitlementId: price.entitlement_id ?? undefined,
			priceId: price.id,
		})),
		...effectiveProduct.entitlements
			.filter((ent) => !priceReferencedEntitlementIds.has(ent.id))
			.map((ent) => ({ entitlementId: ent.id })),
	];
};

/** Applies a diff-style license customize onto the base license product and
 * materializes custom rows for the changed items only. */
export const computeLicenseCustomize = async ({
	ctx,
	licenseProduct,
	customize,
}: {
	ctx: AutumnContext;
	licenseProduct: FullProduct;
	customize: LicenseCustomize;
}): Promise<LicenseCustomizeComputation> => {
	const basePlan = await getPlanResponse({
		ctx,
		product: licenseProduct,
		features: ctx.features,
	});
	const applied = applyDiff({ base: basePlan, diff: customize });

	const custom = await setupCustomFullProduct({
		ctx,
		currentFullProduct: licenseProduct,
		customizePlan: {
			price: applied.price
				? {
						amount: applied.price.amount,
						interval: applied.price.interval,
						...(applied.price.interval_count != null
							? { interval_count: applied.price.interval_count }
							: {}),
					}
				: null,
			items: applied.items.map(toCreatePlanItemParams),
		},
	});
	return {
		effectiveProduct: custom.fullProduct,
		customPrices: custom.customPrices as Price[],
		customEntitlements: custom.customEnts as Entitlement[],
	};
};
