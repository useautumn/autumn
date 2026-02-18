import type { Customer } from "@useautumn/sdk";

type CustomerBalance = Customer["balances"][string];
type CustomerFeature = NonNullable<Customer["balances"][string]["feature"]>;

const getAvailableOverage = ({
	balance,
}: {
	balance: CustomerBalance;
}): number | undefined => {
	const breakdown = balance.breakdown ?? [];
	const usageBasedBreakdown = breakdown.filter(
		(item) => item.price?.billingMethod === "usage_based",
	);

	if (usageBasedBreakdown.length === 0) {
		return balance.maxPurchase ?? undefined;
	}

	let maxOverage = 0;
	let overageUsage = 0;

	for (const item of usageBasedBreakdown) {
		if (item.price?.maxPurchase === null) {
			return undefined;
		}

		if (item.price?.maxPurchase !== undefined) {
			maxOverage += item.price.maxPurchase;
		}

		const overage = Math.max(
			0,
			item.usage - item.includedGrant - item.prepaidGrant,
		);
		overageUsage += overage;
	}

	return Math.max(0, maxOverage - overageUsage);
};

export const balanceToAllowed = ({
	balance,
	feature,
	requiredBalance,
}: {
	balance: CustomerBalance;
	feature: CustomerFeature;
	requiredBalance: number;
}) => {
	if (feature.type === "boolean") {
		return true;
	}

	if (balance.unlimited) {
		return true;
	}

	if (requiredBalance < 0) {
		return true;
	}

	if (balance.overageAllowed) {
		const availableOverage = getAvailableOverage({ balance });
		if (availableOverage === undefined) {
			return true;
		}

		return balance.remaining + availableOverage >= requiredBalance;
	}

	return balance.remaining >= requiredBalance;
};
