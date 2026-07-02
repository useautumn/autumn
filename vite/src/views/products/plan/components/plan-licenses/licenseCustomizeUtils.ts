import {
	type Feature,
	type FrontendProduct,
	type LicenseCustomize,
	type PlanLicense,
	type ProductItem,
	type ProductV2,
	productV2ToApiPlanV1,
	productV2ToFeatureItems,
	toCreatePlanItemParams,
} from "@autumn/shared";
import { planItemV1ToProductItem } from "@/utils/product/productItemUtils/planItemV1ToProductItem";

/**
 * The license's effective feature items for a plan: the per-plan `customize`
 * items when set, otherwise the license's own feature items.
 */
export const planLicenseItems = ({
	planLicense,
	license,
	features,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
	features: Feature[];
}): ProductItem[] => {
	if (!planLicense.customize) {
		return productV2ToFeatureItems({ items: license.items });
	}

	return planLicense.customize.items.flatMap((item) => {
		const productItem = planItemV1ToProductItem({ item, features });
		return productItem ? [productItem] : [];
	});
};

/**
 * Convert an edited license product into a plan-license `customize` payload.
 * Prices are stripped — the backend rejects priced items in customize, since a
 * license's billing always comes from its own plan, not the parent's copy.
 */
export const productToLicenseCustomize = ({
	product,
	features,
	currency,
}: {
	product: FrontendProduct;
	features: Feature[];
	currency?: string;
}): LicenseCustomize => {
	const apiPlan = productV2ToApiPlanV1({
		product: product as unknown as ProductV2,
		features,
		currency,
	});

	const items = apiPlan.items.map(
		(item: Parameters<typeof toCreatePlanItemParams>[0]) => {
			const { price, ...rest } = toCreatePlanItemParams(item);
			return rest;
		},
	);

	return { items };
};
