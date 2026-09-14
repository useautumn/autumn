import type { CreditSchemaItem } from "@autumn/shared";
import { isGraduated } from "./creditSchemaUtils";

export const formatCredits = (amount: number) =>
	`${amount} ${amount === 1 ? "credit" : "credits"}`;

const dimensionCountSuffix = (item: CreditSchemaItem): string => {
	const count = Object.keys(item.dimensions ?? {}).length;
	if (count === 0) return "";
	return ` · ${count} ${count === 1 ? "dimension" : "dimensions"}`;
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
		? `per $${billingUnits} ${unitName}`
		: billingUnits === 1
			? `per ${unitName}`
			: `per ${billingUnits} ${unitName}`;

	const rate = !isGraduated(item)
		? `${formatCredits(item.credit_amount)} ${per}`
		: item.tiers.length === 1
			? `${formatCredits(item.tiers[0].credit_amount)} ${per}`
			: `${item.tiers.length} tiers · from ${formatCredits(item.tiers[0].credit_amount)}`;

	return `${rate}${dimensionCountSuffix(item)}`;
};
