import {
	type CustomizePlanLicense,
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
import { useLicenseDraftStore } from "./useLicenseDraftStore";

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

/**
 * Build the license's per-plan override payload from the edited card state
 * (drafted quantity/pooling + edited items). Shared by the catalog save
 * (set_plan_license) and the customize collect path (attach/update payloads).
 * Untouched items stay un-customized so the license's own items keep flowing
 * through; once a customize exists it must be re-sent whole.
 */
export const buildCustomizePlanLicense = ({
	product,
	planLicense,
	license,
	features,
	currency,
	itemsChanged,
}: {
	product: FrontendProduct;
	planLicense: PlanLicense;
	license: ProductV2;
	features: Feature[];
	currency?: string;
	itemsChanged: boolean;
}): CustomizePlanLicense => {
	// Read the drafts imperatively at save time so editing them doesn't
	// re-render callers on every keystroke.
	const draft = useLicenseDraftStore.getState().drafts[license.id];
	const includedQuantity =
		draft?.includedQuantity ?? planLicense.included_quantity;
	const pooledFeatureIds =
		draft?.pooledFeatureIds ?? planLicense.pooled_feature_ids;
	const shouldSendCustomize = itemsChanged || Boolean(planLicense.customize);

	return {
		license_plan_id: license.id,
		included_quantity: includedQuantity,
		allow_extra_quantity: planLicense.allow_extra_quantity,
		pooled_feature_ids: pooledFeatureIds,
		...(shouldSendCustomize
			? {
					customize: productToLicenseCustomize({ product, features, currency }),
				}
			: {}),
	};
};
