import type { BalancesCheckResponse, Customer } from "@useautumn/sdk";
import type { CheckParams } from "../../../types";

type CustomerBalance = Customer["balances"][string];

const resolveRequiredBalance = ({
	requiredBalance,
	requiredQuantity,
}: {
	requiredBalance?: number;
	requiredQuantity?: number;
}) => {
	return requiredBalance ?? requiredQuantity ?? 1;
};

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

const isBalanceAllowed = ({
	balance,
	requiredBalance,
}: {
	balance: CustomerBalance;
	requiredBalance: number;
}) => {
	if (balance.feature?.type === "boolean") {
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

const getCreditBalanceRequired = ({
	creditBalance,
	featureId,
	requiredBalance,
}: {
	creditBalance: CustomerBalance;
	featureId: string;
	requiredBalance: number;
}) => {
	const creditCost =
		creditBalance.feature?.creditSchema?.find(
			(schema) => schema.meteredFeatureId === featureId,
		)?.creditCost ?? 1;

	return requiredBalance * creditCost;
};

const getFeatureCheckResponse = ({
	customer,
	params,
}: {
	customer: Customer;
	params: CheckParams;
}): BalancesCheckResponse => {
	const featureId = params.featureId;
	if (!featureId) {
		return {
			allowed: false,
			customerId: customer.id ?? "",
			entityId: params.entityId ?? null,
			requiredBalance: resolveRequiredBalance({
				requiredBalance: params.requiredBalance,
				requiredQuantity: params.requiredQuantity,
			}),
			balance: null,
		};
	}

	const requiredBalance = resolveRequiredBalance({
		requiredBalance: params.requiredBalance,
		requiredQuantity: params.requiredQuantity,
	});

	const mainBalance = customer.balances[featureId];

	const creditBalances = Object.values(customer.balances).filter((balance) =>
		balance.feature?.creditSchema?.some(
			(schema) => schema.meteredFeatureId === featureId,
		),
	);

	if (
		mainBalance &&
		isBalanceAllowed({ balance: mainBalance, requiredBalance })
	) {
		return {
			allowed: true,
			customerId: customer.id ?? "",
			entityId: params.entityId ?? null,
			requiredBalance,
			balance: mainBalance as BalancesCheckResponse["balance"],
		};
	}

	for (const creditBalance of creditBalances) {
		const creditRequiredBalance = getCreditBalanceRequired({
			creditBalance,
			featureId,
			requiredBalance,
		});

		if (
			isBalanceAllowed({
				balance: creditBalance,
				requiredBalance: creditRequiredBalance,
			})
		) {
			return {
				allowed: true,
				customerId: customer.id ?? "",
				entityId: params.entityId ?? null,
				requiredBalance: creditRequiredBalance,
				balance: creditBalance as BalancesCheckResponse["balance"],
			};
		}
	}

	if (mainBalance) {
		return {
			allowed: false,
			customerId: customer.id ?? "",
			entityId: params.entityId ?? null,
			requiredBalance,
			balance: mainBalance as BalancesCheckResponse["balance"],
		};
	}

	if (creditBalances.length > 0) {
		const firstCreditBalance = creditBalances[0];
		return {
			allowed: false,
			customerId: customer.id ?? "",
			entityId: params.entityId ?? null,
			requiredBalance: getCreditBalanceRequired({
				creditBalance: firstCreditBalance,
				featureId,
				requiredBalance,
			}),
			balance: firstCreditBalance as BalancesCheckResponse["balance"],
		};
	}

	return {
		allowed: false,
		customerId: customer.id ?? "",
		entityId: params.entityId ?? null,
		requiredBalance,
		balance: null,
	};
};

const getProductCheckResponse = ({
	customer,
	params,
}: {
	customer: Customer;
	params: CheckParams;
}): BalancesCheckResponse => {
	const productId = params.productId;
	const requiredBalance = resolveRequiredBalance({
		requiredBalance: params.requiredBalance,
		requiredQuantity: params.requiredQuantity,
	});

	if (!productId) {
		return {
			allowed: false,
			customerId: customer.id ?? "",
			entityId: params.entityId ?? null,
			requiredBalance,
			balance: null,
		};
	}

	const now = Date.now();
	const hasActiveSubscription = customer.subscriptions.some(
		(subscription) =>
			subscription.planId === productId &&
			(subscription.status === "active" || subscription.status === "scheduled"),
	);
	const hasActivePurchase = customer.purchases.some(
		(purchase) =>
			purchase.planId === productId &&
			(purchase.expiresAt === null || purchase.expiresAt > now),
	);

	return {
		allowed: hasActiveSubscription || hasActivePurchase,
		customerId: customer.id ?? "",
		entityId: params.entityId ?? null,
		requiredBalance,
		balance: null,
	};
};

export const getLocalCheckResponse = ({
	customer,
	params,
}: {
	customer: Customer | null;
	params: CheckParams;
}): BalancesCheckResponse => {
	if (!customer) {
		return {
			allowed: false,
			customerId: "",
			entityId: params.entityId ?? null,
			requiredBalance: resolveRequiredBalance({
				requiredBalance: params.requiredBalance,
				requiredQuantity: params.requiredQuantity,
			}),
			balance: null,
		};
	}

	if (!params.featureId && !params.productId) {
		throw new Error("check() requires either featureId or productId");
	}

	if (params.productId && !params.featureId) {
		return getProductCheckResponse({ customer, params });
	}

	return getFeatureCheckResponse({ customer, params });
};
