import {
	applyDiff,
	BillingInterval,
	type CustomizePlanLicense,
	diffPlanV1,
	type Feature,
	type FrontendProduct,
	type LicenseCustomize,
	type PlanLicense,
	type PlanLicenseParams,
	type ProductItem,
	type ProductItemInterval,
	type ProductV2,
	productV2ToApiPlanV1,
	productV2ToBasePrice,
	productV2ToFeatureItems,
} from "@autumn/shared";
import { planItemV1ToProductItem } from "@/utils/product/productItemUtils/planItemV1ToProductItem";
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

/** Card seed for a flow that already holds a customize patch: the stock
 * license items with the saved diff applied. */
export const licenseItemsWithCustomize = ({
	license,
	customize,
	features,
	currency,
}: {
	license: ProductV2;
	customize: LicenseCustomize;
	features: Feature[];
	currency?: string;
}): ProductItem[] => {
	const base = productV2ToApiPlanV1({ product: license, features, currency });
	const applied = applyDiff({ base, diff: customize });
	const featureItems = applied.items
		.map((item) => planItemV1ToProductItem({ item, features }))
		.filter((item): item is ProductItem => item !== null);
	if (!applied.price) return featureItems;
	const { amount, interval, interval_count, additional_currencies } =
		applied.price;
	const priceItem: ProductItem = {
		price: amount,
		interval:
			interval === BillingInterval.OneOff
				? null
				: (interval as string as ProductItemInterval),
		interval_count: interval_count ?? 1,
		additional_currencies,
	};
	return [priceItem, ...featureItems];
};

/** Builds one parent `licenses[]` entry, including its item diff when edited. */
export const buildPlanLicenseParams = ({
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
}): PlanLicenseParams => {
	// Read the drafts imperatively at save time so editing them doesn't
	// re-render callers on every keystroke.
	const draft = useLicenseDraftStore.getState().drafts[license.id];
	return {
		license_plan_id: license.id,
		included: draft?.included ?? planLicense.included,
		prepaid_only: planLicense.prepaid_only,
		...(itemsChanged
			? {
					customize: productToLicenseCustomize({
						product,
						license,
						features,
						currency,
					}),
				}
			: {}),
	};
};

/** Returns the item diff against the supplied base, or null to clear it. */
export const productToLicenseCustomize = ({
	product,
	license,
	features,
	currency,
}: {
	product: FrontendProduct;
	license: ProductV2;
	features: Feature[];
	currency?: string;
}): LicenseCustomize | null => {
	const basePrice = productV2ToBasePrice({ product });
	if (
		basePrice &&
		(typeof basePrice.price !== "number" || !Number.isFinite(basePrice.price))
	) {
		throw new Error("Enter a base price before saving");
	}

	const base = productV2ToApiPlanV1({ product: license, features, currency });
	const edited = productV2ToApiPlanV1({
		product: { ...license, items: product.items },
		features,
		currency,
	});
	const diff = diffPlanV1({
		from: base,
		to: edited,
		includeCurrencyListChanges: true,
	});
	const customize = {
		...(diff.price !== undefined ? { price: diff.price } : {}),
		...(diff.add_items !== undefined ? { add_items: diff.add_items } : {}),
		...(diff.remove_items !== undefined
			? { remove_items: diff.remove_items }
			: {}),
	};
	return Object.keys(customize).length > 0 ? customize : null;
};

/** Builds a customer-level `add_licenses` entry from the edited card state. */
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
					customize: productToLicenseCustomize({
						product,
						license,
						features,
						currency,
					}),
				}
			: {}),
	};
};
