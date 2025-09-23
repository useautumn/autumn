import type { Feature } from "../models/featureModels/featureModels.js";
import { Infinite } from "../models/productModels/productEnums.js";
import {
	type ProductItem,
	ProductItemFeatureType,
	type ProductItemInterval,
} from "../models/productV2Models/productItemModels/productItemModels.js";
import {
	formatAmount,
	getFeatureName,
	numberWithCommas,
} from "./displayUtils.js";
import {
	isFeatureItem,
	isFeaturePriceItem,
	isPriceItem,
} from "./productDisplayUtils/getItemType.js";
import { notNullish, nullish } from "./utils.js";

export const formatTiers = ({
	item,
	currency,
}: {
	item: ProductItem;
	currency?: string | null;
}) => {
	const tiers = item.tiers;
	if (tiers) {
		if (tiers.length == 1) {
			return formatAmount({
				currency,
				amount: tiers[0].amount,
			});
		}

		const firstPrice = tiers[0].amount;
		const lastPrice = tiers[tiers.length - 1].amount;

		return `${formatAmount({
			currency,
			amount: firstPrice,
		})} - ${formatAmount({
			currency,
			amount: lastPrice,
		})}`;
	}
};

export const getIntervalString = ({
	interval,
	intervalCount,
}: {
	interval: ProductItemInterval;
	intervalCount?: number | null;
}) => {
	if (!interval) return "";
	if (intervalCount == 1) {
		return `per ${interval}`;
	}
	return `per ${intervalCount} ${interval}s`;
};

export const getFeatureItemDisplay = ({
	item,
	feature,
}: {
	item: ProductItem;
	feature?: Feature;
}) => {
	if (!feature) {
		throw new Error(`Feature ${item.feature_id} not found`);
	}
	// 1. If feature
	if (item.feature_type == ProductItemFeatureType.Static) {
		return {
			primary_text: getFeatureName({
				feature,
				plural: false,
				capitalize: true,
			}),
		};
	}

	const featureName = getFeatureName({
		feature,
		units: item.included_usage,
	});

	const includedUsageTxt =
		item.included_usage == Infinite
			? "Unlimited "
			: nullish(item.included_usage) || item.included_usage == 0
				? ""
				: `${numberWithCommas(item.included_usage!)} `;

	return {
		primary_text: `${includedUsageTxt}${featureName}`,
	};
};

export const getPriceItemDisplay = ({
	item,
	currency,
}: {
	item: ProductItem;
	currency?: string | null;
}) => {
	const primaryText = formatAmount({
		currency,
		amount: item.price as number,
	});

	const intervalStr = getIntervalString({
		interval: item.interval!,
		intervalCount: item.interval_count,
	});

	const secondaryText = intervalStr || undefined;

	return {
		primary_text: primaryText,
		secondary_text: secondaryText,
	};
};

export const getFeaturePriceItemDisplay = ({
	feature,
	item,
	currency,
	isMainPrice = false,
	minifyIncluded = false,
}: {
	feature?: Feature;
	item: ProductItem;
	currency?: string | null;
	isMainPrice?: boolean;
	minifyIncluded?: boolean;
}) => {
	if (!feature) {
		throw new Error(`Feature ${item.feature_id} not found`);
	}

	// 1. Get included usage
	const includedFeatureName = getFeatureName({
		feature,
		units: item.included_usage,
	});

	const includedUsage = item.included_usage as number | null;
	let includedUsageStr = "";
	if (notNullish(includedUsage) && includedUsage! > 0) {
		if (minifyIncluded) {
			includedUsageStr = `${numberWithCommas(includedUsage!)} included`;
		} else {
			includedUsageStr = `${numberWithCommas(includedUsage!)} ${includedFeatureName}`;
		}
	}

	const priceStr = formatTiers({ item, currency });
	const billingFeatureName = getFeatureName({
		feature,
		units: item.billing_units,
	});

	let priceStr2 = "";
	if (item.billing_units && item.billing_units > 1) {
		priceStr2 = `${numberWithCommas(item.billing_units)} ${billingFeatureName}`;
	} else {
		priceStr2 = `${billingFeatureName}`;
	}

	// let intervalStr = isMainPrice && item.interval ? ` per ${item.interval}` : "";
	const intervalStr = isMainPrice
		? getIntervalString({
				interval: item.interval!,
				intervalCount: item.interval_count,
			})
		: "";

	if (includedUsageStr) {
		return {
			primary_text: includedUsageStr,
			secondary_text: `then ${priceStr} per ${priceStr2} ${intervalStr}`,
		};
	}

	if (isMainPrice) {
		return {
			primary_text: priceStr,
			secondary_text: `per ${priceStr2} ${intervalStr}`,
		};
	}

	return {
		primary_text: priceStr + ` per ${priceStr2} ${intervalStr}`,
		secondary_text: "",
	};
};

export const getProductItemDisplay = ({
	item,
	features,
	currency = "usd",
}: {
	item: ProductItem;
	features: Feature[];
	currency?: string | null;
}) => {
	if (isFeatureItem(item)) {
		return getFeatureItemDisplay({
			item,
			feature: features.find((f) => f.id === item.feature_id),
		});
	}

	if (isPriceItem(item)) {
		return getPriceItemDisplay({
			item,
			currency,
		});
	}

	if (isFeaturePriceItem(item)) {
		return getFeaturePriceItemDisplay({
			item,
			feature: features.find((f) => f.id === item.feature_id),
			currency,
		});
	}

	return {
		primary_text: "couldn't detect item type",
		secondary_text: "",
	};
};
