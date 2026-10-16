import type {
	EntitlementWithFeature,
	Feature,
	FreeTrial,
	FullProduct,
	Product,
} from "@autumn/shared";
import type { EntitlementPricesPlan } from "@/internal/products/actions/computeEntitlementPricesPlan";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";

const resolveProjectedFeature = ({
	entitlement,
	features,
}: {
	entitlement: EntitlementWithFeature;
	features: Feature[];
}): Feature =>
	features.find(
		(feature) => feature.internal_id === entitlement.internal_feature_id,
	) ?? entitlement.feature;

const resolveNextEntitlements = ({
	entitlementPricesPlan,
	currentFullProduct,
	features,
}: {
	entitlementPricesPlan?: EntitlementPricesPlan;
	currentFullProduct: FullProduct | null;
	features: Feature[];
}): EntitlementWithFeature[] => {
	if (entitlementPricesPlan) {
		return getEntsWithFeature({
			ents: entitlementPricesPlan.projected.entitlements,
			features,
		});
	}

	return (currentFullProduct?.entitlements ?? []).map((entitlement) => ({
		...entitlement,
		feature: resolveProjectedFeature({ entitlement, features }),
	}));
};

/** Join product stamp + projected prices/ents/trial into the next FullProduct. */
export const assembleNextFullProduct = ({
	product,
	entitlementPricesPlan,
	freeTrial,
	features,
	currentFullProduct,
}: {
	product: Product;
	entitlementPricesPlan?: EntitlementPricesPlan;
	freeTrial: FreeTrial | null;
	features: Feature[];
	currentFullProduct: FullProduct | null;
}): FullProduct => {
	const prices = entitlementPricesPlan
		? entitlementPricesPlan.projected.prices
		: (currentFullProduct?.prices ?? []);
	const entitlements = resolveNextEntitlements({
		entitlementPricesPlan,
		currentFullProduct,
		features,
	});

	return {
		...product,
		prices,
		entitlements,
		free_trial: freeTrial,
		licenses: currentFullProduct?.licenses,
		parent_plan_licenses: currentFullProduct?.parent_plan_licenses,
	} as FullProduct;
};
