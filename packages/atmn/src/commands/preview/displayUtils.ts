// AUTO-GENERATED - DO NOT EDIT MANUALLY
// Generated from @autumn/shared display utilities
// Run `pnpm gen:atmn` to regenerate


/**
 * Minimal Feature type for display functions
 * Matches the shape expected by @autumn/shared display utils
 */
export interface FeatureForDisplay {
	name: string;
	display?: {
		singular?: string;
		plural?: string;
	} | null;
}


/**
 * Format currency amount
 * Adapted from @autumn/shared/utils/common/formatUtils/formatAmount.ts
 */
export const formatAmount = ({
	amount,
	currency = "USD",
	maxFractionDigits = 10,
	minFractionDigits = 0,
}: {
	amount: number;
	currency?: string;
	maxFractionDigits?: number;
	minFractionDigits?: number;
}): string => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: minFractionDigits,
		maximumFractionDigits: maxFractionDigits,
	}).format(amount);
};


/**
 * Format billing interval
 * Copied from @autumn/shared/utils/common/formatUtils/formatInterval.ts
 */
export const formatInterval = ({
	interval,
	intervalCount = 1,
	prefix = "per ",
}: {
	interval?: string;
	intervalCount?: number;
	prefix?: string;
}): string => {
	if (!interval) return "";

	// Handle one_off (show "one time")
	if (interval === "one_off") {
		return "one-off";
	}

	// Handle lifetime (no interval string)
	if (interval === "lifetime") {
		return "";
	}

	let intervalStr: string = interval;

	// Handle special case for semi_annual
	if (interval === "semi_annual") {
		intervalStr = "half year";
	}

	if (intervalCount === 1) {
		return `${prefix}${intervalStr}`;
	}

	return `${prefix}${intervalCount} ${intervalStr}s`;
};


/**
 * Get feature name with singular/plural handling
 * Copied from @autumn/shared/utils/displayUtils.ts
 */
export const getFeatureName = ({
	feature,
	plural,
	units,
	capitalize = false,
}: {
	feature?: FeatureForDisplay;
	plural?: boolean;
	units?: any;
	capitalize?: boolean;
}) => {
	if (!feature) {
		return "";
	}

	let featureName = feature.name || "";

	if (feature.display) {
		let finalPlural: boolean | undefined;
		// Case 1: If units and nullish plural

		if (plural !== undefined) {
			finalPlural = plural;
		} else {
			finalPlural = units !== 1;
		}

		if (finalPlural) {
			featureName = feature.display.plural || featureName;
		} else {
			featureName = feature.display.singular || featureName;
		}
	}

	if (capitalize) {
		featureName = featureName
			.split(" ")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");
	}

	return featureName;
};


/**
 * Get feature name with first letter capitalized
 * Copied from @autumn/shared/utils/displayUtils.ts
 */
export const getFeatureNameWithCapital = ({
	feature,
}: {
	feature: FeatureForDisplay;
}) => {
	if (feature.name && feature.name.length > 0) {
		return `${feature.name.charAt(0).toUpperCase()}${feature.name.slice(1)}`;
	}

	return feature.name;
};


/**
 * Get both singular and plural forms of feature name
 * Copied from @autumn/shared/utils/displayUtils.ts
 */
export const getSingularAndPlural = ({
	feature,
	capitalize = false,
}: {
	feature: FeatureForDisplay;
	capitalize?: boolean;
}) => {
	return {
		singular: getFeatureName({ feature, plural: false, capitalize }),
		plural: getFeatureName({ feature, plural: true, capitalize }),
	};
};


/**
 * Format a number with commas
 * Copied from @autumn/shared/utils/displayUtils.ts
 */
export const numberWithCommas = (x: number) => {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 20 }).format(
		x,
	);
};


/**
 * Get feature name based on usage count (singular/plural)
 * Copied from @autumn/shared/utils/displayUtils.ts
 */
export const usageToFeatureName = ({
	usage,
	feature,
}: {
	usage: number;
	feature: FeatureForDisplay;
}) => {
	const { singular, plural } = getSingularAndPlural({ feature });

	if (usage === 1) {
		return singular;
	}

	return plural;
};


/**
 * Get invoice description for a feature
 * Adapted from @autumn/shared/utils/displayUtils.ts
 * Note: Simplified to remove date-fns dependency
 */
export const getFeatureInvoiceDescription = ({
	feature,
	usage,
	billingUnits = 1,
	prodName,
	isPrepaid = false,
}: {
	feature: FeatureForDisplay;
	usage: number;
	billingUnits?: number | null;
	prodName?: string;
	isPrepaid?: boolean;
}) => {
	const { singular, plural } = getSingularAndPlural({ feature });

	const usageStr = numberWithCommas(Math.ceil(usage));

	let result = "";

	if (isPrepaid && billingUnits && billingUnits > 1) {
		result = `${usageStr} x ${billingUnits} ${plural}`; // eg. 4 x 100 credits
	} else {
		if (usage === 1) {
			result = `${usageStr} ${singular}`; // eg. 1 credit
		} else {
			result = `${usageStr} ${plural}`; // eg. 4 credits
		}
	}

	if (prodName) {
		result = `${prodName} - ${result}`;
	}

	return result;
};


/**
 * Format tiered pricing range
 */
export const formatTiers = ({
	tiers,
	currency = "USD",
}: {
	tiers: Array<{ to: number | "inf"; amount: number }>;
	currency?: string;
}): string => {
	if (tiers.length === 0) return "";

	if (tiers.length === 1) {
		return formatAmount({ amount: tiers[0].amount, currency });
	}

	const firstAmount = formatAmount({ amount: tiers[0].amount, currency });
	const lastAmount = formatAmount({ amount: tiers[tiers.length - 1].amount, currency });

	return `${firstAmount} - ${lastAmount}`;
};
