import type { CreditSchemaItem } from "@autumn/shared";
import { isGraduated } from "./creditSchemaUtils";

const formatCredits = (amount: number) =>
	`${amount} ${amount === 1 ? "credit" : "credits"}`;

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

	if (!isGraduated(item)) return `${formatCredits(item.credit_amount)} ${per}`;
	if (item.tiers.length === 1)
		return `${formatCredits(item.tiers[0].credit_amount)} ${per}`;
	return `${item.tiers.length} tiers · from ${formatCredits(item.tiers[0].credit_amount)}`;
};
