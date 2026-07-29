import {
	applyDiff,
	type Entitlement,
	type FullProduct,
	type LicenseCustomize,
	type Price,
	toBasePriceParams,
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

/** Builds the complete junction item set; unchanged definitions retain their stock ids. */
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

/** Applies a license diff while retaining stock row ids for reuse. */
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
				? toBasePriceParams(applied.price, { includeInternalIds: true })
				: null,
			items: applied.items.map((item) =>
				toCreatePlanItemParams(item, { includeInternalIds: true }),
			),
		},
	});

	return {
		effectiveProduct: custom.fullProduct,
		customPrices: custom.customPrices,
		customEntitlements: custom.customEnts,
	};
};
