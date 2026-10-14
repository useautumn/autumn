import { isAiCreditSystem } from "@utils/featureUtils/classifyFeature/isAiCreditSystem";
import { isVolumeFlatFeeTiers } from "@utils/productUtils/priceUtils/classifyPrice/isVolumeFlatFeeTiers";
import {
	FeatureType,
	FeatureUsageType,
} from "../models/featureModels/featureEnums.js";
import type { Feature } from "../models/featureModels/featureModels.js";
import { TierBehavior } from "../models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import { Infinite } from "../models/productModels/productEnums.js";
import type { ProductItem } from "../models/productV2Models/productItemModels/productItemModels.js";
import { formatAmount } from "./common/formatUtils/formatAmount.js";
import { formatInterval } from "./common/formatUtils/formatInterval.js";
import { formatVolumeTierRule } from "./common/formatUtils/formatVolumeTierRule.js";
import { getFeatureName, numberWithCommas } from "./displayUtils.js";
import { tiersToVolumeTierPricing } from "./productUtils/priceUtils/convertPrice/tiersToVolumeTierPricing.js";
import {
	isFeatureItem,
	isFeaturePriceItem,
	isPriceItem,
} from "./productV2Utils/productItemUtils/getItemType.js";
import {
	itemToBillingInterval,
	itemToBillingIntervalCount,
} from "./productV2Utils/productItemUtils/itemIntervalUtils.js";
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
	useFlatAmount?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

const getResetIntervalDisplay = (item: ProductItem): string | undefined => {
	if (!item.interval) return undefined;

	return formatInterval({
		interval: item.interval,
		intervalCount: item.interval_count ?? undefined,
	});
};

const getBillingIntervalDisplay = (item: ProductItem): string | undefined => {
	const interval = itemToBillingInterval({ item });
	if (!interval) return undefined;

	return formatInterval({
		interval,
		intervalCount: itemToBillingIntervalCount({ item }),
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

const isVolumeFlatAmountItem = (item: ProductItem): boolean =>
	isVolumeFlatFeeTiers({ tierBehavior: item.tier_behavior, tiers: item.tiers });

/** Appends the volume rate rule, since a volume price range reads the same as a
 * graduated one but bills every unit at a single tier. */
const withVolumeTierRule = ({
	item,
	text,
}: {
	item: ProductItem;
	text: string;
}): string => {
	const includedUsage =
		typeof item.included_usage === "number" ? item.included_usage : 0;
	const isVolume = item.tier_behavior === TierBehavior.VolumeBased;
	const hasMultipleTiers = (item.tiers?.length ?? 0) > 1;
	// A single tier still charges the included units once usage passes them.
	const showsRule = isVolume && (hasMultipleTiers || includedUsage > 0);
	if (!showsRule || !item.tiers?.length) return text;

	const rule = formatVolumeTierRule({
		includedUsage,
		pricing: tiersToVolumeTierPricing({ tiers: item.tiers }),
	});
	return `${text} (${rule})`;
};

// ============================================================================
// Tier Formatting
// ============================================================================

export const formatTiers = ({
	item,
	currency,
	amountFormatOptions,
	useFlatAmount = false,
}: FormatTiersParams): string | undefined => {
	const tiers = item.tiers;
	if (!tiers) return undefined;

	const format = (amount: number) =>
		formatAmount({ currency, amount, amountFormatOptions });

	const getAmount = (tier: (typeof tiers)[number]) =>
		useFlatAmount ? (tier.flat_amount ?? 0) : tier.amount;

	if (tiers.length === 1) {
		return format(getAmount(tiers[0]));
	}

	const firstPrice = getAmount(tiers[0]);
	const lastPrice = getAmount(tiers[tiers.length - 1]);

	return `${format(firstPrice)} - ${format(lastPrice)}`;
};

// ============================================================================
// Feature Item Display (no pricing, just entitlement)
// ============================================================================

export const getFeatureItemDisplay = ({
	item,
	feature,
	entityFeature,
	fullDisplay = false,
}: {
	item: ProductItem;
	feature?: Feature;
	entityFeature?: Feature;
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

	// Determine secondary text: per-entity scope + interval.
	// e.g. "per user per month" when entity_feature_id is set, otherwise "per month".
	let secondaryText: string | undefined;
	if (fullDisplay) {
		const parts: string[] = [];

		if (item.entity_feature_id && entityFeature) {
			const entityName = getFeatureName({
				feature: entityFeature,
				units: 1,
			});
			if (entityName) {
				parts.push(`per ${entityName}`);
			}
		}

		const intervalDisplay = getResetIntervalDisplay(item);
		if (intervalDisplay) {
			parts.push(intervalDisplay);
		} else if (
			isSingleUseFeature(feature) &&
			item.included_usage !== Infinite
		) {
			parts.push("one-off");
		}

		if (parts.length > 0) {
			secondaryText = parts.join(" ");
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

	const secondaryText = getBillingIntervalDisplay(item);

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
	let includedUsageStr = "";
	if (hasIncludedUsage) {
		includedUsageStr = `${numberWithCommas(includedUsage)} ${includedFeatureName}`;
	}

	const volumeFlatAmount = isVolumeFlatAmountItem(item);

	// For volume flat-amount items, tier.amount is always 0 — the real price
	// lives in tier.flat_amount, so we must pass useFlatAmount: true.
	let priceStr: string;
	if (volumeFlatAmount) {
		priceStr =
			formatTiers({
				item,
				currency,
				amountFormatOptions,
				useFlatAmount: true,
			}) ?? "";
	} else if (item.tiers) {
		priceStr = formatTiers({ item, currency, amountFormatOptions }) ?? "";
	} else {
		priceStr = notNullish(item.price)
			? formatAmount({ currency, amount: item.price, amountFormatOptions })
			: "";
	}

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
		const intervalDisplay = getBillingIntervalDisplay(item);
		if (intervalDisplay) {
			intervalStr = intervalDisplay;
		} else if (isSingleUseFeature(feature)) {
			intervalStr = "one-off";
		}
	}

	// Format output based on what we have
	if (hasIncludedUsage) {
		if (volumeFlatAmount) {
			const featureName = getFeatureName({ feature, units: 2 });
			return {
				primary_text: includedUsageStr,
				secondary_text: withVolumeTierRule({
					item,
					text: `then ${priceStr} for ${featureName} ${intervalStr}`.trim(),
				}),
			};
		}
		return {
			primary_text: includedUsageStr,
			secondary_text: withVolumeTierRule({
				item,
				text: `then ${priceStr} per ${perUnitStr} ${intervalStr}`.trim(),
			}),
		};
	}

	if (volumeFlatAmount) {
		const featureName = getFeatureName({ feature, units: 2 });
		if (showInterval) {
			return {
				primary_text: priceStr,
				secondary_text: withVolumeTierRule({
					item,
					text: `for ${featureName} ${intervalStr}`.trim(),
				}),
			};
		}
		return {
			primary_text: withVolumeTierRule({
				item,
				text: `${priceStr} for ${featureName}`.trim(),
			}),
			secondary_text: undefined,
		};
	}

	if (showInterval) {
		return {
			primary_text: priceStr,
			secondary_text: withVolumeTierRule({
				item,
				text: `per ${perUnitStr} ${intervalStr}`.trim(),
			}),
		};
	}

	return {
		primary_text: withVolumeTierRule({
			item,
			text: `${priceStr} per ${perUnitStr}`.trim(),
		}),
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
	const findEntityFeature = () =>
		item.entity_feature_id
			? features.find((f) => f.id === item.entity_feature_id)
			: undefined;

	if (isFeatureItem(item)) {
		return getFeatureItemDisplay({
			item,
			feature: findFeature(),
			entityFeature: findEntityFeature(),
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
