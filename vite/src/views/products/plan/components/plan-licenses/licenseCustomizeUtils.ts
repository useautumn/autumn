import {
	type CustomizePlanLicense,
	type Feature,
	type FrontendProduct,
	type LicenseCustomize,
	type PlanLicense,
	type PlanLicenseParams,
	type ProductItem,
	type ProductV2,
	productV2ToApiPlanV1,
	productV2ToFeatureItems,
	toCreatePlanItemParams,
} from "@autumn/shared";
import { useLicenseDraftStore } from "./useLicenseDraftStore";

/** Snapshot of a license card's edited state at save/collect time. */
export type LicenseEditSnapshot = {
	product: FrontendProduct;
	itemsChanged: boolean;
};

/** The license plan's own items (base price + feature items) — what a card's
 * inline editor is seeded with. */
export const planLicenseItems = ({
	license,
}: {
	license: ProductV2;
}): ProductItem[] =>
	productV2ToFeatureItems({
		items: license.items,
		withBasePrice: true,
	});

/**
 * Build the catalog `licenses[]` entry for a card from its drafted link
 * config. The license plan's items are saved on the license plan itself, not
 * through the parent.
 */
export const buildPlanLicenseParams = ({
	planLicense,
	license,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
}): PlanLicenseParams => {
	// Read the drafts imperatively at save time so editing them doesn't
	// re-render callers on every keystroke.
	const draft = useLicenseDraftStore.getState().drafts[license.id];
	return {
		license_plan_id: license.id,
		included: draft?.included ?? planLicense.included,
		prepaid_only: planLicense.prepaid_only,
	};
};

/**
 * Convert an edited license product into a customer-level `customize` payload.
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
 * Build the customer-level `add_licenses` entry from the edited card state
 * (drafted quantity + edited items). Used by the attach/update customize
 * collector; untouched items stay un-customized so the license's own items
 * keep flowing through.
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
	const draft = useLicenseDraftStore.getState().drafts[license.id];
	const included = draft?.included ?? planLicense.included;

	return {
		license_plan_id: license.id,
		included: included,
		prepaid_only: planLicense.prepaid_only,
		...(itemsChanged
			? {
					customize: productToLicenseCustomize({ product, features, currency }),
				}
			: {}),
	};
};
