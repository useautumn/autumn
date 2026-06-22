import type { CreatePlanItemParamsV1Input } from "@api/products/items/crud/createPlanItemParamsV1.js";
import { formatAmount } from "@utils/common/formatUtils/formatAmount.js";
import { numberWithCommas } from "@utils/displayUtils.js";

export type PlanItemDisplayFeature = {
	id: string;
	name: string;
	type?: string;
	display?: {
		singular?: string;
		plural?: string;
	} | null;
};

export type PlanItemDisplay = {
	featureId: string;
	primaryText: string;
	secondaryText?: string;
	details?: string[];
};

const formatPriceAmount = ({
	amount,
	currency,
}: {
	amount: number;
	currency?: string | null;
}) =>
	formatAmount({
		amount,
		currency: currency ?? undefined,
		amountFormatOptions: {
			currencyDisplay: "narrowSymbol",
			maximumFractionDigits: 10,
		},
	});

const formatIntervalText = ({
	interval,
	intervalCount = 1,
	prefix = "per ",
}: {
	interval?: string;
	intervalCount?: number;
	prefix?: string;
}) => {
	if (!interval) return undefined;
	if (interval === "one_off") return "one-off";
	if (interval === "lifetime") return undefined;

	const intervalText = interval === "semi_annual" ? "half year" : interval;
	if (intervalCount === 1) return `${prefix}${intervalText}`;
	return `${prefix}${intervalCount} ${intervalText}s`;
};

const formatResetInterval = (item: CreatePlanItemParamsV1Input) =>
	formatIntervalText({
		interval: item.reset?.interval,
		intervalCount: item.reset?.interval_count,
	});

const formatPriceInterval = (item: CreatePlanItemParamsV1Input) =>
	formatIntervalText({
		interval: item.price?.interval,
		intervalCount: item.price?.interval_count,
	});

const getDisplayFeatureName = ({
	feature,
	units,
}: {
	feature?: PlanItemDisplayFeature;
	units?: number | "inf" | null;
}) => {
	if (!feature) return "";
	const plural = units !== 1;
	if (plural) return feature.display?.plural || feature.name;
	if (feature.display?.singular) return feature.display.singular;

	const words = feature.name.split(" ");
	const lastWord = words[words.length - 1];
	if (!lastWord) return feature.name;

	const lower = lastWord.toLowerCase();
	let singular = lastWord;
	if (lower.endsWith("ies")) {
		singular = `${lastWord.slice(0, -3)}y`;
	} else if (
		lower.endsWith("ses") ||
		lower.endsWith("xes") ||
		lower.endsWith("ches") ||
		lower.endsWith("shes")
	) {
		singular = lastWord.slice(0, -2);
	} else if (lower.endsWith("s") && !lower.endsWith("ss")) {
		singular = lastWord.slice(0, -1);
	}

	return [...words.slice(0, -1), singular].join(" ");
};

const formatTierRange = ({
	currency,
	item,
	useFlatAmount,
}: {
	currency?: string | null;
	item: CreatePlanItemParamsV1Input;
	useFlatAmount: boolean;
}) => {
	const tiers = item.price?.tiers;
	if (!tiers?.length) return undefined;

	const first = tiers[0];
	const last = tiers[tiers.length - 1];
	const getAmount = (tier: (typeof tiers)[number]) =>
		useFlatAmount ? (tier.flat_amount ?? 0) : (tier.amount ?? 0);

	if (tiers.length === 1) {
		return formatPriceAmount({ amount: getAmount(first), currency });
	}

	return `${formatPriceAmount({
		amount: getAmount(first),
		currency,
	})} - ${formatPriceAmount({ amount: getAmount(last), currency })}`;
};

const formatTierDetails = ({
	currency,
	item,
	useFlatAmount,
}: {
	currency?: string | null;
	item: CreatePlanItemParamsV1Input;
	useFlatAmount: boolean;
}) => {
	const tiers = item.price?.tiers;
	if (!tiers || tiers.length <= 1) return undefined;

	const details: string[] = [];
	let previousTo = 0;
	for (const tier of tiers) {
		const from = previousTo + 1;
		const amount = useFlatAmount ? (tier.flat_amount ?? 0) : (tier.amount ?? 0);
		const price = formatPriceAmount({ amount, currency });

		if (tier.to === "inf") {
			details.push(`${numberWithCommas(from)}+: ${price}`);
		} else {
			details.push(
				`${numberWithCommas(from)} - ${numberWithCommas(tier.to)}: ${price}`,
			);
			previousTo = tier.to;
		}
	}

	return details;
};

const hasVolumeFlatTiers = (item: CreatePlanItemParamsV1Input) =>
	item.price?.tier_behavior === "volume" &&
	Boolean(item.price.tiers?.some((tier) => (tier.flat_amount ?? 0) > 0));

const buildPriceDisplay = ({
	currency,
	feature,
	item,
}: {
	currency?: string | null;
	feature?: PlanItemDisplayFeature;
	item: CreatePlanItemParamsV1Input;
}) => {
	const price = item.price;
	if (!price) return undefined;

	const useFlatAmount = hasVolumeFlatTiers(item);
	const amount = price.tiers
		? formatTierRange({ currency, item, useFlatAmount })
		: typeof price.amount === "number"
			? formatPriceAmount({ amount: price.amount, currency })
			: undefined;
	if (!amount) return undefined;

	const billingUnits = price.billing_units ?? 1;
	const featureName = getDisplayFeatureName({ feature, units: billingUnits });
	const perUnit =
		billingUnits > 1
			? `${numberWithCommas(billingUnits)} ${featureName}`
			: featureName;

	return {
		details: formatTierDetails({ currency, item, useFlatAmount }),
		text: useFlatAmount
			? `${amount} for ${featureName}`
			: `${amount} per ${perUnit}`,
	};
};

export const getPlanItemDisplay = ({
	currency,
	features,
	item,
}: {
	currency?: string | null;
	features: PlanItemDisplayFeature[];
	item: CreatePlanItemParamsV1Input;
}): PlanItemDisplay => {
	const feature = features.find((candidate) => candidate.id === item.feature_id);
	const featureName = feature?.name || item.feature_id;

	if (feature?.type === "boolean") {
		return {
			featureId: item.feature_id,
			primaryText: featureName,
		};
	}

	const interval = formatResetInterval(item) ?? formatPriceInterval(item);

	if (item.unlimited) {
		return {
			featureId: item.feature_id,
			primaryText: ["Unlimited", featureName, interval].filter(Boolean).join(" "),
		};
	}

	const priceDisplay = buildPriceDisplay({ currency, feature, item });
	const included = item.included ?? 0;
	const hasIncluded = included > 0;

	if (hasIncluded) {
		const includedText = `${numberWithCommas(included)} ${getDisplayFeatureName({
			feature,
			units: included,
		})}`;

		if (priceDisplay) {
			return {
				details: priceDisplay.details,
				featureId: item.feature_id,
				primaryText: includedText,
				secondaryText: ["then", priceDisplay.text, interval]
					.filter(Boolean)
					.join(" "),
			};
		}

		return {
			featureId: item.feature_id,
			primaryText: [includedText, interval].filter(Boolean).join(" "),
		};
	}

	if (priceDisplay) {
		return {
			details: priceDisplay.details,
			featureId: item.feature_id,
			primaryText: [priceDisplay.text, interval].filter(Boolean).join(" "),
		};
	}

	return {
		featureId: item.feature_id,
		primaryText: featureName,
	};
};
