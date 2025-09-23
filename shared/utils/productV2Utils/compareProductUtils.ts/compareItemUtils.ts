/** biome-ignore-all lint/suspicious/noDoubleEquals: need to compare null / undefined for different fields */
import {
	type Feature,
	type FeatureItem,
	FeatureItemSchema,
	type FeaturePriceItem,
	FeaturePriceItemSchema,
	FeatureUsageType,
	type PriceItem,
	PriceItemSchema,
	type ProductItem,
	type UsageTier,
} from "@autumn/shared";
import { itemToFeature } from "../productItemUtils/convertItemUtils.js";
import {
	isFeatureItem,
	isFeaturePriceItem,
	isPriceItem,
} from "../productItemUtils/getItemType.js";

export const findSimilarItem = ({
	item,
	items,
}: {
	item: ProductItem;
	items: ProductItem[];
}) => {
	// 1. If feature item
	if (isFeatureItem(item) || isFeaturePriceItem(item)) {
		return items.find((i) => i.feature_id === item.feature_id);
	}

	// 2. If price item
	if (isPriceItem(item)) {
		return items.find((i) => {
			return (
				isPriceItem(i) &&
				i.price == item.price &&
				i.interval == item.interval &&
				(i.interval_count || 1) == (item.interval_count || 1)
			);
		});
	}

	return null;
};

const tiersAreSame = (
	tiers1: UsageTier[] | null,
	tiers2: UsageTier[] | null,
) => {
	if (!tiers1 && !tiers2) {
		return true;
	}

	if (!tiers1 || !tiers2) {
		return false;
	}

	if (tiers1.length !== tiers2.length) {
		return false;
	}

	return tiers1.every(
		(tier: UsageTier, index: number) =>
			tier.amount === tiers2[index].amount && tier.to === tiers2[index].to,
	);
};

export const featureItemsAreSame = ({
	item1,
	item2,
}: {
	item1: FeatureItem;
	item2: FeatureItem;
}) => {
	// Compare config objects (including rollover)
	const configsAreSame =
		JSON.stringify(item1.config) === JSON.stringify(item2.config);

	const same =
		item1.feature_id === item2.feature_id &&
		item1.included_usage == item2.included_usage &&
		item1.interval == item2.interval &&
		(item1.interval_count || 1) == (item2.interval_count || 1) &&
		item1.entity_feature_id == item2.entity_feature_id &&
		item1.reset_usage_when_enabled == item2.reset_usage_when_enabled &&
		configsAreSame;

	return same;
};

export const priceItemsAreSame = ({
	item1,
	item2,
}: {
	item1: PriceItem;
	item2: PriceItem;
}) => {
	const same =
		item1.price === item2.price &&
		item1.interval == item2.interval &&
		(item1.interval_count || 1) == (item2.interval_count || 1);

	if (!same) {
		console.log(`Price items different: ${item1.price}`);
	}

	return same;
};

export const featurePriceItemsAreSame = ({
	item1,
	item2,
}: {
	item1: FeaturePriceItem;
	item2: FeaturePriceItem;
}) => {
	const entsSame = {
		included_usage: {
			condition: item1.included_usage == item2.included_usage,
			message: `Included usage different: ${item1.included_usage} != ${item2.included_usage}`,
		},
		usage_limit: {
			condition: item1.usage_limit == item2.usage_limit,
			message: `Usage limit different: ${item1.usage_limit} !== ${item2.usage_limit}`,
		},
		reset_usage_when_enabled: {
			condition:
				item1.reset_usage_when_enabled == item2.reset_usage_when_enabled,
			message: `Reset usage when enabled different: ${item1.reset_usage_when_enabled} !== ${item2.reset_usage_when_enabled}`,
		},
		config: {
			condition: JSON.stringify(item1.config) === JSON.stringify(item2.config),
			message: `Config different: ${JSON.stringify(item1.config)} !== ${JSON.stringify(item2.config)}`,
		},
	};

	const pricesSame = {
		feature_id: {
			condition: item1.feature_id === item2.feature_id,
			message: `Feature ID different: ${item1.feature_id} != ${item2.feature_id}`,
		},
		interval: {
			condition: item1.interval == item2.interval,
			message: `Interval different: ${item1.interval} != ${item2.interval}`,
		},
		interval_count: {
			condition: (item1.interval_count || 1) == (item2.interval_count || 1),
			message: `Interval count different: ${item1.interval_count} != ${item2.interval_count}`,
		},
		usage_model: {
			condition: item1.usage_model === item2.usage_model,
			message: `Usage model different: ${item1.usage_model} != ${item2.usage_model}`,
		},
		price: {
			condition: item1.price == item2.price,
			message: `Price different: ${item1.price} != ${item2.price}`,
		},
		tiers: {
			condition: tiersAreSame(item1.tiers || null, item2.tiers || null),
			message: `Tiers different`,
		},
		billing_units: {
			condition: item1.billing_units == item2.billing_units,
			message: `Billing units different: ${item1.billing_units} !== ${item2.billing_units}`,
		},
		reset_usage_when_enabled: {
			condition:
				item1.reset_usage_when_enabled == item2.reset_usage_when_enabled,
			message: `Reset usage when enabled different: ${item1.reset_usage_when_enabled} !== ${item2.reset_usage_when_enabled}`,
		},
	};

	const same =
		Object.values(pricesSame).every((d) => d.condition) &&
		Object.values(entsSame).every((d) => d.condition);

	const pricesChanged = Object.values(pricesSame).some((d) => !d.condition);

	if (!same) {
		console.log(
			"Feature price items different:",
			Object.values(entsSame)
				.filter((d) => !d.condition)
				.map((d) => d.message),
			Object.values(pricesSame)
				.filter((d) => !d.condition)
				.map((d) => d.message),
		);
	}

	return {
		same,
		pricesChanged,
	};
};

export const itemsAreSame = ({
	item1,
	item2,
	features,
}: {
	item1: ProductItem;
	item2: ProductItem;
	features?: Feature[];
}) => {
	// 1. If feature item
	let same = false;
	let pricesChanged = false;

	if (isFeatureItem(item1)) {
		if (!isFeatureItem(item2)) {
			return {
				same: false,
				pricesChanged: true,
			};
		}

		same = featureItemsAreSame({
			item1: FeatureItemSchema.parse(item1),
			item2: item2 as FeatureItem,
		});

		pricesChanged = false;
	}

	if (isFeaturePriceItem(item1)) {
		if (!isFeaturePriceItem(item2)) {
			return {
				same: false,
				pricesChanged: true,
			};
		}

		const { same: same_, pricesChanged: pricesChanged_ } =
			featurePriceItemsAreSame({
				item1: FeaturePriceItemSchema.parse(item1),
				item2: FeaturePriceItemSchema.parse(item2),
			});

		same = same_;

		const feature = itemToFeature({
			item: item1,
			features: features || [],
		});

		if (feature?.config?.usage_type === FeatureUsageType.Continuous) {
			pricesChanged = true;
		} else {
			pricesChanged = pricesChanged_;
		}
	}

	// 2. If price item
	if (isPriceItem(item1)) {
		same = priceItemsAreSame({
			item1: PriceItemSchema.parse(item1),
			item2: PriceItemSchema.parse(item2),
		});
		if (!same) {
			pricesChanged = true;
		}
	}

	return {
		same,
		pricesChanged: !same && pricesChanged,
	};
};
