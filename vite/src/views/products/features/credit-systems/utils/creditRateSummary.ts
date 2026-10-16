import {
	type CreditSchemaItem,
	type Feature,
	findFeatureById,
	getFeatureName,
	hasCreditDimensionRules,
	isAiCreditSystem,
} from "@autumn/shared";
import { isGraduated } from "./creditSchemaUtils";

const formatCredits = (amount: number) =>
	`${amount} ${amount === 1 ? "credit" : "credits"}`;

const countLabel = (count: number, noun: string) =>
	`${count} ${noun}${count === 1 ? "" : "s"}`;

/** " · varies by event · 2 dimensions, 1 multiplier", so a rule-based rate never reads as fixed. */
const variesSuffix = (item: CreditSchemaItem): string => {
	if (!hasCreditDimensionRules(item)) return "";
	const counts = [
		[Object.keys(item.dimensions ?? {}).length, "dimension"],
		[Object.keys(item.multipliers ?? {}).length, "multiplier"],
	] as const;
	const parts = counts.flatMap(([n, noun]) => (n ? [countLabel(n, noun)] : []));
	return ` · varies by event · ${parts.join(", ")}`;
};

export const creditRateSummary = ({
	item,
	unitName,
	isAiChild,
}: {
	item: CreditSchemaItem;
	unitName: string;
	isAiChild: boolean;
}): string => {
	const billingUnits = item.feature_amount ?? 1;
	const per = isAiChild
		? ` per $${billingUnits} ${unitName}`
		: billingUnits === 1
			? ""
			: ` per ${billingUnits} ${unitName}`;

	const rate = !isGraduated(item)
		? `${formatCredits(item.credit_amount)}${per}`
		: item.tiers.length === 1
			? `${formatCredits(item.tiers[0].credit_amount)}${per}`
			: `${item.tiers.length} tiers · from ${formatCredits(item.tiers[0].credit_amount)}`;

	return `${rate}${variesSuffix(item)}`;
};

/** The unit a feature's rate is counted in: "web searches", or "of AI usage" for AI children. */
export const rateUnit = ({
	feature,
	billingUnits = 1,
}: {
	feature?: Feature;
	billingUnits?: number;
}) => {
	const isAiChild = isAiCreditSystem(feature?.type);
	const unitName = isAiChild
		? "of AI usage"
		: getFeatureName({ feature, plural: billingUnits !== 1 }) || "units";
	return { unitName, isAiChild };
};

/** creditRateSummary with the unit taken from the rate's feature. */
export const rateText = ({
	rate,
	features,
}: {
	rate: CreditSchemaItem;
	features: Feature[];
}) =>
	creditRateSummary({
		item: rate,
		...rateUnit({
			feature: findFeatureById({
				features,
				featureId: rate.metered_feature_id,
				errorOnNotFound: false,
			}),
			billingUnits: rate.feature_amount,
		}),
	});
