/** biome-ignore-all lint/suspicious/noDoubleEquals: need to compare null / undefined for different fields */

import { FeatureUsageType } from "../../../models/featureModels/featureEnums.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import type { UsageTier } from "../../../models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import type { FeatureItem } from "../../../models/productV2Models/productItemModels/featureItem.js";
import type { FeaturePriceItem } from "../../../models/productV2Models/productItemModels/featurePriceItem.js";
import type { PriceItem } from "../../../models/productV2Models/productItemModels/priceItem.js";
import type {
	ProductItem,
	ProductItemConfig,
	RolloverConfig,
} from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { entIntervalsSame, intervalsSame } from "../../intervalUtils.js";
import { itemToFeature } from "../productItemUtils/convertItemUtils.js";
import {
	isFeatureItem,
	isFeaturePriceItem,
	isPriceItem,
} from "../productItemUtils/getItemType.js";
import {
	itemToBillingInterval,
	itemToEntInterval,
} from "../productItemUtils/itemIntervalUtils.js";

export const findSimilarItem = ({
	item,
	items,
}: {
	item: ProductItem;
	items: ProductItem[];
}) => {
	if (isFeatureItem(item)) {
		return items.find(
			(i) =>
				i.feature_id === item.feature_id &&
				entIntervalsSame({
					intervalA: {
						interval: itemToEntInterval({ item: i }),
						intervalCount: i.interval_count,
					},
					intervalB: {
						interval: itemToEntInterval({ item }),
						intervalCount: item.interval_count,
					},
				}),
		);
	}

	if (isFeaturePriceItem(item)) {
		return items.find(
			(i) =>
				i.feature_id === item.feature_id &&
				intervalsSame({
					intervalA: {
						interval: itemToBillingInterval({ item: i }),
						intervalCount: i.interval_count,
					},
					intervalB: {
						interval: itemToBillingInterval({ item }),
						intervalCount: item.interval_count,
					},
				}) &&
				item.usage_model == i.usage_model,
		);
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
	logDifferences = false,
}: {
	item1: FeatureItem;
	item2: FeatureItem;
	logDifferences?: boolean;
}) => {
	const checks = {
		feature_id: {
			condition: item1.feature_id === item2.feature_id,
			message: `Feature ID different: ${item1.feature_id} != ${item2.feature_id}`,
		},
		included_usage: {
			condition: item1.included_usage == item2.included_usage,
			message: `Included usage different: ${item1.included_usage} != ${item2.included_usage}`,
		},
		interval: {
			condition: item1.interval == item2.interval,
			message: `Interval different: ${item1.interval} != ${item2.interval}`,
		},
		interval_count: {
			condition: (item1.interval_count || 1) == (item2.interval_count || 1),
			message: `Interval count different: ${item1.interval_count} != ${item2.interval_count}`,
		},
		entity_feature_id: {
			condition: item1.entity_feature_id == item2.entity_feature_id,
			message: `Entity feature ID different: ${item1.entity_feature_id} != ${item2.entity_feature_id}`,
		},
		reset_usage_when_enabled: {
			condition:
				item1.reset_usage_when_enabled == item2.reset_usage_when_enabled,
			message: `Reset usage when enabled different: ${item1.reset_usage_when_enabled} !== ${item2.reset_usage_when_enabled}`,
		},
		rollover_config: {
			condition: rolloversAreSame({
				rollover1: item1.config?.rollover || undefined,
				rollover2: item2.config?.rollover || undefined,
			}),
			message: `Rollover config different: ${JSON.stringify(item1.config?.rollover)} !== ${JSON.stringify(item2.config?.rollover)}`,
		},
		// config: {
		// 	condition: JSON.stringify(item1.config) === JSON.stringify(item2.config),
		// 	message: `Config different: ${JSON.stringify(item1.config)} !== ${JSON.stringify(item2.config)}`,
		// },
	};

	const same = Object.values(checks).every((d) => d.condition);

	if (!same && logDifferences) {
		console.log(
			"Feature items different:",
			Object.values(checks)
				.filter((d) => !d.condition)
				.map((d) => d.message),
		);
	}

	return same;
};

export const priceItemsAreSame = ({
	item1,
	item2,
	logDifferences = false,
}: {
	item1: PriceItem;
	item2: PriceItem;
	logDifferences?: boolean;
}) => {
	const same =
		item1.price === item2.price &&
		item1.interval == item2.interval &&
		(item1.interval_count || 1) == (item2.interval_count || 1);

	if (!same && logDifferences) {
		console.log(`Price items different: ${item1.price}`);
	}

	return same;
};

const prorationConfigsAreSame = ({
	config1,
	config2,
}: {
	config1?: ProductItemConfig;
	config2?: ProductItemConfig;
}) => {
	return (
		config1?.on_increase === config2?.on_increase &&
		config1?.on_decrease === config2?.on_decrease
	);
};

const rolloversAreSame = ({
	rollover1,
	rollover2,
}: {
	rollover1?: RolloverConfig;
	rollover2?: RolloverConfig;
}) => {
	if (rollover1 && !rollover2) {
		return false;
	}
	if (!rollover1 && rollover2) {
		return false;
	}
	return (
		rollover1?.max === rollover2?.max &&
		rollover1?.duration === rollover2?.duration &&
		rollover1?.length === rollover2?.length
	);
};

export const featurePriceItemsAreSame = ({
	item1,
	item2,
	logDifferences = false,
}: {
	item1: FeaturePriceItem;
	item2: FeaturePriceItem;
	logDifferences?: boolean;
}) => {
	// console.log("Item 1 config:", item1.config);
	// console.log("Item 2 config:", item2.config);
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
		proration_config: {
			condition: prorationConfigsAreSame({
				config1: item1.config || undefined,
				config2: item2.config || undefined,
			}),
			message: `Proration config different: ${JSON.stringify(item1.config)} !== ${JSON.stringify(item2.config)}`,
		},
		rollover_config: {
			condition: rolloversAreSame({
				rollover1: item1.config?.rollover || undefined,
				rollover2: item2.config?.rollover || undefined,
			}),
			message: `Rollover config different: ${JSON.stringify(item1.config?.rollover)} !== ${JSON.stringify(item2.config?.rollover)}`,
		},
		entity_feature_id: {
			condition: item1.entity_feature_id == item2.entity_feature_id,
			message: `Entity feature ID different: ${item1.entity_feature_id} != ${item2.entity_feature_id}`,
		},

		// config: {
		// 	condition: JSON.stringify(item1.config) === JSON.stringify(item2.config),
		// 	message: `Config different: ${JSON.stringify(item1.config)} !== ${JSON.stringify(item2.config)}`,
		// },
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

	if (!same && logDifferences) {
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
	logDifferences = false,
}: {
	item1: ProductItem;
	item2: ProductItem;
	features?: Feature[];
	logDifferences?: boolean;
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
			item1: item1 as FeatureItem,
			item2: item2 as FeatureItem,
			logDifferences,
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
				item1: item1 as FeaturePriceItem,
				item2: item2 as FeaturePriceItem,
				logDifferences,
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
			item1: item1 as PriceItem,
			item2: item2 as PriceItem,
			logDifferences,
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
