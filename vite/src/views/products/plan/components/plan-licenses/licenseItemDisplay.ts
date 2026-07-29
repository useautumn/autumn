import {
	type Feature,
	FeatureType,
	type ProductItem,
	ProductItemFeatureType,
	type ProductV2,
	productV2ToBasePrice,
	UsageModel,
} from "@autumn/shared";

// A license has no backing feature, so render it as a non-consumable feature
// whose "feature" is the license plan itself — included seats + per-seat base
// price — so the same display logic as normal plan item rows formats it.
export function licenseToFeature(license: ProductV2): Feature {
	return {
		internal_id: license.internal_id ?? license.id,
		org_id: "",
		created_at: license.created_at,
		env: license.env,
		id: license.id,
		name: license.name ?? license.id,
		type: FeatureType.Metered,
		config: undefined,
		display: null,
		archived: false,
		event_names: [],
	};
}

export function licenseToItem({
	license,
	included,
	priceProduct,
}: {
	license: ProductV2;
	included: number;
	priceProduct: ProductV2;
}): ProductItem {
	const basePrice = productV2ToBasePrice({ product: priceProduct });
	return {
		feature_id: license.id,
		feature_type: ProductItemFeatureType.ContinuousUse,
		included_usage: included,
		price: basePrice?.price ?? null,
		interval: basePrice?.interval ?? null,
		interval_count: basePrice?.interval_count ?? null,
		billing_units: 1,
		usage_model: basePrice ? UsageModel.Prepaid : null,
		tiers: null,
	};
}
