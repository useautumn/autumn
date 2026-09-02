import {
	type CreditSchemaItem,
	type CreditSystemConfig,
	creditDimensionRulesEqual,
} from "@autumn/shared";

const creditSchemaItemsEqual = ({
	left,
	right,
}: {
	left: CreditSchemaItem;
	right: CreditSchemaItem;
}): boolean => {
	if ((left.feature_amount ?? 1) !== (right.feature_amount ?? 1)) return false;
	if (left.tier_behavior !== right.tier_behavior) return false;
	if (!creditDimensionRulesEqual({ left, right })) return false;

	if (
		left.tier_behavior !== "graduated" ||
		right.tier_behavior !== "graduated"
	) {
		return left.credit_amount === right.credit_amount;
	}

	if (left.tiers.length !== right.tiers.length) return false;
	return left.tiers.every(
		(tier, index) =>
			tier.to === right.tiers[index]?.to &&
			tier.credit_amount === right.tiers[index]?.credit_amount,
	);
};

export const hasCreditRateCardChanged = ({
	oldConfig,
	newConfig,
}: {
	oldConfig: CreditSystemConfig | undefined;
	newConfig: CreditSystemConfig | undefined;
}): boolean => {
	if (
		(oldConfig?.invoice_credit ?? false) !==
		(newConfig?.invoice_credit ?? false)
	) {
		return true;
	}

	const oldSchema = oldConfig?.schema ?? [];
	const newSchema = newConfig?.schema ?? [];
	if (oldSchema.length !== newSchema.length) return true;

	const oldSchemaByFeatureId = new Map(
		oldSchema.map((item) => [item.metered_feature_id, item]),
	);
	return newSchema.some((newItem) => {
		const oldItem = oldSchemaByFeatureId.get(newItem.metered_feature_id);
		return (
			oldItem === undefined ||
			!creditSchemaItemsEqual({ left: oldItem, right: newItem })
		);
	});
};
