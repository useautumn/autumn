import { FeatureType } from "../models/featureModels/featureEnums.js";
import type { Feature } from "../models/featureModels/featureModels.js";
import { ProductItemInterval } from "../models/productModels/intervals/productItemInterval.js";
import { Infinite } from "../models/productModels/productEnums.js";
import type { ProductItem } from "../models/productV2Models/productItemModels/productItemModels.js";
import {
	formatAmount,
	getFeatureName,
	numberWithCommas,
} from "./displayUtils.js";
import {
	isFeatureItem,
	isFeaturePriceItem,
	isPriceItem,
} from "./productV2Utils/productItemUtils/getItemType.js";
import { notNullish, nullish } from "./utils.js";

export const formatTiers = ({
	item,
	currency,
	amountFormatOptions,
}: {
	item: ProductItem;
	currency?: string | null;
	amountFormatOptions?: Intl.NumberFormatOptions;
}) => {
	const tiers = item.tiers;
	if (tiers) {
		if (tiers.length === 1) {
			return formatAmount({
				currency,
				amount: tiers[0].amount,
				amountFormatOptions,
			});
		}

		const firstPrice = tiers[0].amount;
		const lastPrice = tiers[tiers.length - 1].amount;

		return `${formatAmount({
			currency,
			amount: firstPrice,
			amountFormatOptions,
		})} - ${formatAmount({
			currency,
			amount: lastPrice,
			amountFormatOptions,
		})}`;
	}
};

export const getIntervalString = ({
	interval,
	intervalCount = 1,
}: {
	interval: ProductItemInterval | null | undefined;
	intervalCount?: number | null;
}) => {
	let intervalStr: string = interval || "";

	if (interval === ProductItemInterval.SemiAnnual) {
		intervalStr = "half year";
	}

	if (!interval) return "";
	if (intervalCount === 1) {
		return `per ${intervalStr}`;
	}
	return `per ${intervalCount} ${intervalStr}s`;
};

export const getFeatureItemDisplay = ({
	item,
	feature,
	fullDisplay = false,
}: {
	item: ProductItem;
	feature?: Feature;
	fullDisplay?: boolean;
}) => {
	if (!feature) throw new Error(`Feature ${item.feature_id} not found`);

	if (feature.type === FeatureType.Boolean) {
		return { primary_text: feature.name };
	}

	const featureName = getFeatureName({
		feature,
		units: item.included_usage,
	});

	const includedUsageTxt =
		item.included_usage === Infinite
			? "Unlimited "
			: nullish(item.included_usage) || item.included_usage === 0
				? "0 "
				: `${numberWithCommas(item.included_usage)} `;

	const intervalStr = getIntervalString({
		interval: item.interval,
		intervalCount: item.interval_count,
	});

	return {
		primary_text: `${includedUsageTxt}${featureName}`,
		secondary_text: fullDisplay && intervalStr ? intervalStr : undefined,
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
		interval: item.interval,
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
	// minifyIncluded = false,
	amountFormatOptions,
	fullDisplay = false,
}: {
	feature?: Feature;
	item: ProductItem;
	currency?: string | null;
	isMainPrice?: boolean;
	// minifyIncluded?: boolean;
	amountFormatOptions?: Intl.NumberFormatOptions;
	fullDisplay?: boolean;
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
	if (notNullish(includedUsage) && includedUsage > 0) {
		includedUsageStr = `${numberWithCommas(includedUsage)} ${includedFeatureName}`;
	}

	const priceStr = formatTiers({ item, currency, amountFormatOptions }) ?? "";

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
	const intervalStr =
		isMainPrice || fullDisplay
			? getIntervalString({
					interval: item.interval,
					intervalCount: item.interval_count,
				})
			: "";

	if (includedUsageStr) {
		return {
			primary_text: includedUsageStr,
			secondary_text: `then ${priceStr} per ${priceStr2} ${intervalStr}`,
		};
	}

	if (isMainPrice || fullDisplay) {
		return {
			primary_text: priceStr,
			secondary_text: `per ${priceStr2} ${intervalStr}`,
		};
	}

	return {
		primary_text: `${priceStr} per ${priceStr2} ${intervalStr}`,
		secondary_text: undefined,
	};
};

export const getProductItemDisplay = ({
	item,
	features,
	currency = "usd",
	fullDisplay = false,
	amountFormatOptions,
}: {
	item: ProductItem;
	features: Feature[];
	currency?: string | null;
	fullDisplay?: boolean;
	amountFormatOptions?: Intl.NumberFormatOptions;
}) => {
	if (isFeatureItem(item)) {
		return getFeatureItemDisplay({
			item,
			feature: features.find((f) => f.id === item.feature_id),
			fullDisplay,
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
			fullDisplay,
			amountFormatOptions,
		});
	}

	return {
		primary_text: "couldn't detect item type",
		secondary_text: undefined,
	};
};
