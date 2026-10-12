import type {
	CreditSchemaItem,
	CreditTier,
	Feature,
	FeatureConfigOverride,
	FeatureMarkupsOverride,
} from "@autumn/shared";
import {
	FeatureType,
	hasCreditDimensionRules,
	numberWithCommas,
} from "@autumn/shared";
import { featureDisplayName } from "./featureDisplayName";

/** `value` is the rate card text; `detail` spells out every rule so two different rates never read the same. */
export type RateCardLine = {
	key: string;
	label: string;
	/** The metered feature a credit rate applies to; markup lines have none. */
	meteredFeatureId?: string;
	value: string;
	detail: string;
};

type CreditRate =
	| { credit_amount: number; tier_behavior?: undefined }
	| { tier_behavior: "graduated"; tiers: CreditTier[] };

export const countLabel = (count: number, noun: string) =>
	`${count} ${noun}${count === 1 ? "" : "s"}`;

/** AI credit children are metered in dollars, so their rate reads per $. */
const perUnitsText = ({
	item,
	perDollar,
}: {
	item: CreditSchemaItem;
	perDollar: boolean;
}) => {
	const units = item.feature_amount ?? 1;
	if (perDollar) return ` / $${units === 1 ? "" : numberWithCommas(units)}`;
	return units !== 1 ? ` per ${numberWithCommas(units)}` : "";
};

const tierListText = (tiers: CreditTier[]) =>
	tiers
		.map((tier, index) => {
			const amount = numberWithCommas(tier.credit_amount);
			if (tier.to === "inf") return `${amount} above`;
			return `${amount}${index === 0 ? " credits" : ""} up to ${numberWithCommas(tier.to)}`;
		})
		.join(" · ");

const baseRateText = ({
	rate,
	detailed,
}: {
	rate: CreditRate;
	detailed: boolean;
}) => {
	if (rate.tier_behavior !== "graduated")
		return `${numberWithCommas(rate.credit_amount)} credits`;
	if (detailed) return `${tierListText(rate.tiers)} (tiered)`;
	const costs = rate.tiers.map((tier) => tier.credit_amount);
	return `${Math.min(...costs)}–${Math.max(...costs)} credits (tiered)`;
};

const dimensionedRateText = (item: CreditSchemaItem) => {
	const parts: string[] = [];
	const dimensions = Object.keys(item.dimensions ?? {}).length;
	const multipliers = Object.keys(item.multipliers ?? {}).length;
	if (dimensions) parts.push(countLabel(dimensions, "rate"));
	if (multipliers) parts.push(countLabel(multipliers, "multiplier"));
	return `varies by event · ${parts.join(", ")}`;
};

const matchText = (match: Record<string, string>) =>
	`(${Object.entries(match)
		.map(([key, value]) => `${key}=${value}`)
		.join(", ")})`;

const dimensionRulesText = (item: CreditSchemaItem) => [
	...Object.entries(item.dimensions ?? {}).map(
		([name, dimension]) =>
			`${name} ${matchText(dimension.match)}${dimension.priority === undefined ? "" : ` priority ${dimension.priority}`} ${baseRateText({ rate: dimension, detailed: true })}`,
	),
	...Object.entries(item.multipliers ?? {}).map(([name, multiplier]) =>
		[
			name,
			matchText(multiplier.match),
			multiplier.factor === undefined ? null : `×${multiplier.factor}`,
			multiplier.add === undefined ? null : `+${multiplier.add}`,
		]
			.filter((part) => part !== null)
			.join(" "),
	),
];

/** The rate card's one-line rate: flat, tiered range, or a dimension count. */
export const creditRateText = ({
	item,
	perDollar = false,
}: {
	item: CreditSchemaItem;
	perDollar?: boolean;
}) =>
	hasCreditDimensionRules(item)
		? dimensionedRateText(item)
		: `${baseRateText({ rate: item, detailed: false })}${perUnitsText({ item, perDollar })}`;

/** Every tier, dimension and multiplier spelled out. */
export const creditRateDetailText = ({
	item,
	perDollar = false,
}: {
	item: CreditSchemaItem;
	perDollar?: boolean;
}) =>
	[
		`${baseRateText({ rate: item, detailed: true })}${perUnitsText({ item, perDollar })}`,
		...dimensionRulesText(item),
	].join(" · ");

const markupText = (markup: number | undefined) => `${markup ?? 0}% markup`;

const markupLines = (markups: FeatureMarkupsOverride): RateCardLine[] => {
	const modelMarkups = Object.entries(markups.model_markups ?? {});
	const defaultText = markupText(markups.default_markup);
	const modelText = countLabel(modelMarkups.length, "model");
	return [
		{
			key: "default-markup",
			label: "Default",
			value: defaultText,
			detail: defaultText,
		},
		...Object.entries(markups.provider_markups ?? {}).map(
			([providerKey, entry]) => ({
				key: `provider-${providerKey}`,
				label: providerKey,
				value: markupText(entry?.markup),
				detail: markupText(entry?.markup),
			}),
		),
		...(modelMarkups.length > 0
			? [
					{
						key: "model-markups",
						label: "Per-model",
						value: modelText,
						detail: modelMarkups
							.map(([model, entry]) => `${model} ${markupText(entry.markup)}`)
							.sort()
							.join(", "),
					},
				]
			: []),
	];
};

/** Rate card rows for a feature override: per-feature rates, then markups. */
export const featureOverrideRateCard = ({
	override,
	features,
	capitalize = true,
	creditSystem,
}: {
	override: FeatureConfigOverride;
	features: Feature[];
	capitalize?: boolean;
	creditSystem?: Feature;
}): RateCardLine[] => {
	const perDollar = creditSystem?.type === FeatureType.AiCreditSystem;
	return [
		...(override.schema ?? []).map((item) => ({
			key: `feature-${item.metered_feature_id}`,
			meteredFeatureId: item.metered_feature_id,
			label: featureDisplayName({
				features,
				featureId: item.metered_feature_id,
				plural: true,
				capitalize,
			}),
			value: creditRateText({ item, perDollar }),
			detail: creditRateDetailText({ item, perDollar }),
		})),
		...(override.markups ? markupLines(override.markups) : []),
	];
};
