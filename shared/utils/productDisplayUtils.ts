import {
	FeatureType,
	FeatureUsageType,
} from "../models/featureModels/featureEnums.js";
import type { Feature } from "../models/featureModels/featureModels.js";
import { Infinite } from "../models/productModels/productEnums.js";
import type { ProductItem } from "../models/productV2Models/productItemModels/productItemModels.js";
import { formatAmount } from "./common/formatUtils/formatAmount.js";
import { formatInterval } from "./common/formatUtils/formatInterval.js";
import { getFeatureName, numberWithCommas } from "./displayUtils.js";
import {
	isFeatureItem,
	isFeaturePriceItem,
	isPriceItem,
} from "./productV2Utils/productItemUtils/getItemType.js";
import { notNullish, nullish } from "./utils.js";

// ============================================================================
// Types
// ============================================================================

interface DisplayResult {
	primary_text: string;
	secondary_text?: string;
}

interface FormatTiersParams {
	item: ProductItem;
	currency?: string | null;
	amountFormatOptions?: Intl.NumberFormatOptions;
}

// ============================================================================
// Helpers
// ============================================================================

const getIntervalDisplay = (item: ProductItem): string | undefined => {
	if (!item.interval) return undefined;

	return formatInterval({
		interval: item.interval,
		intervalCount: item.interval_count ?? undefined,
	});
};

const getIncludedUsageText = (item: ProductItem, feature: Feature): string => {
	const featureName = getFeatureName({
		feature,
		units: item.included_usage,
	});

	if (item.included_usage === Infinite) {
		return `Unlimited ${featureName}`;
	}

	if (nullish(item.included_usage) || item.included_usage === 0) {
		return `0 ${featureName}`;
	}

	return `${numberWithCommas(item.included_usage)} ${featureName}`;
};

const isSingleUseFeature = (feature: Feature): boolean => {
	return feature.config?.usage_type === FeatureUsageType.Single;
};

// ============================================================================
// Tier Formatting
// ============================================================================

export const formatTiers = ({
	item,
	currency,
	amountFormatOptions,
}: FormatTiersParams): string | undefined => {
	const tiers = item.tiers;
	if (!tiers) return undefined;

	const format = (amount: number) =>
		formatAmount({ currency, amount, amountFormatOptions });

	if (tiers.length === 1) {
		return format(tiers[0].amount);
	}

	const firstPrice = tiers[0].amount;
	const lastPrice = tiers[tiers.length - 1].amount;

	return `${format(firstPrice)} - ${format(lastPrice)}`;
};

// ============================================================================
// Feature Item Display (no pricing, just entitlement)
// ============================================================================

export const getFeatureItemDisplay = ({
	item,
	feature,
	fullDisplay = false,
}: {
	item: ProductItem;
	feature?: Feature;
	fullDisplay?: boolean;
}): DisplayResult => {
	if (!feature) {
		// Return fallback display when feature is not found (e.g., during feature ID rename)
		return { primary_text: item.feature_id || "Loading..." };
	}

	// Boolean features just show the name
	if (feature.type === FeatureType.Boolean) {
		return { primary_text: feature.name };
	}

	const primaryText = getIncludedUsageText(item, feature);

	// Determine secondary text (interval display)
	let secondaryText: string | undefined;
	if (fullDisplay) {
		const intervalDisplay = getIntervalDisplay(item);
		if (intervalDisplay) {
			secondaryText = intervalDisplay;
		} else if (isSingleUseFeature(feature)) {
			// Only show "one-off" for single-use features, not continuous use
			secondaryText = "one-off";
		}
	}

	return {
		primary_text: primaryText,
		secondary_text: secondaryText,
	};
};

// ============================================================================
// Price Item Display (flat price, no feature)
// ============================================================================

export const getPriceItemDisplay = ({
	item,
	currency,
}: {
	item: ProductItem;
	currency?: string | null;
}): DisplayResult => {
	const primaryText = formatAmount({
		currency,
		amount: item.price as number,
	});

	const secondaryText = getIntervalDisplay(item);

	return {
		primary_text: primaryText,
		secondary_text: secondaryText,
	};
};

// ============================================================================
// Feature + Price Item Display (usage-based pricing)
// ============================================================================

export const getFeaturePriceItemDisplay = ({
	feature,
	item,
	currency,
	isMainPrice = false,
	amountFormatOptions,
	fullDisplay = false,
}: {
	feature?: Feature;
	item: ProductItem;
	currency?: string | null;
	isMainPrice?: boolean;
	amountFormatOptions?: Intl.NumberFormatOptions;
	fullDisplay?: boolean;
}): DisplayResult => {
	if (!feature) {
		throw new Error(`Feature ${item.feature_id} not found`);
	}

	// Build included usage string (e.g., "100 credits")
	const includedUsage = item.included_usage as number | null;
	const hasIncludedUsage = notNullish(includedUsage) && includedUsage > 0;

	const includedFeatureName = getFeatureName({
		feature,
		units: item.included_usage,
	});
	const includedUsageStr = hasIncludedUsage
		? `${numberWithCommas(includedUsage)} ${includedFeatureName}`
		: "";

	// Build price string (e.g., "$0.01")
	const priceStr = formatTiers({ item, currency, amountFormatOptions }) ?? "";

	// Build billing unit string (e.g., "credit" or "100 credits")
	const billingUnits = item.billing_units ?? 1;
	const billingFeatureName = getFeatureName({
		feature,
		units: billingUnits,
	});
	const perUnitStr =
		billingUnits > 1
			? `${numberWithCommas(billingUnits)} ${billingFeatureName}`
			: billingFeatureName;

	// Build interval string
	const showInterval = isMainPrice || fullDisplay;
	let intervalStr = "";
	if (showInterval) {
		const intervalDisplay = getIntervalDisplay(item);
		if (intervalDisplay) {
			intervalStr = intervalDisplay;
		} else if (isSingleUseFeature(feature)) {
			intervalStr = "one-off";
		}
	}

	// Format output based on what we have
	if (hasIncludedUsage) {
		return {
			primary_text: includedUsageStr,
			secondary_text:
				`then ${priceStr} per ${perUnitStr} ${intervalStr}`.trim(),
		};
	}

	if (showInterval) {
		return {
			primary_text: priceStr,
			secondary_text: `per ${perUnitStr} ${intervalStr}`.trim(),
		};
	}

	return {
		primary_text: `${priceStr} per ${perUnitStr}`.trim(),
		secondary_text: undefined,
	};
};

// ============================================================================
// Main Entry Point
// ============================================================================

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
}): DisplayResult => {
	const findFeature = () => features.find((f) => f.id === item.feature_id);

	if (isFeatureItem(item)) {
		return getFeatureItemDisplay({
			item,
			feature: findFeature(),
			fullDisplay,
		});
	}

	if (isPriceItem(item)) {
		return getPriceItemDisplay({ item, currency });
	}

	if (isFeaturePriceItem(item)) {
		return getFeaturePriceItemDisplay({
			item,
			feature: findFeature(),
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
