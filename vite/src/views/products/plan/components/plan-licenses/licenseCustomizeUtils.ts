import {
	applyDiff,
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

/** Snapshot of a license card's edited state at save/collect time. */
export type LicenseEditSnapshot = {
	product: FrontendProduct;
	itemsChanged: boolean;
};

/**
 * The license's effective feature items for a plan: the per-plan `customize`
 * diff applied onto the stock license plan, otherwise the license's own
 * feature items.
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

	const stockPlan = productV2ToApiPlanV1({ product: license, features });
	const applied = applyDiff({ base: stockPlan, diff: planLicense.customize });
	return applied.items.flatMap((item) => {
		const productItem = planItemV1ToProductItem({ item, features });
		return productItem ? [productItem] : [];
	});
};

/**
 * Convert an edited license product into a plan-license `customize` payload.
 */
const productToLicenseCustomize = ({
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

	return { items: apiPlan.items.map(toCreatePlanItemParams) };
};

/**
 * Build the license's per-plan override payload from the edited card state
 * (drafted quantity/pooling + edited items). Shared by the catalog save
 * (link) and the customize collect path (attach/update payloads).
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
	const included = draft?.included ?? planLicense.included;
	const shouldSendCustomize = itemsChanged || Boolean(planLicense.customize);

	return {
		license_plan_id: license.id,
		included: included,
		prepaid_only: planLicense.prepaid_only,
		...(shouldSendCustomize
			? {
					customize: productToLicenseCustomize({ product, features, currency }),
				}
			: {}),
	};
};
