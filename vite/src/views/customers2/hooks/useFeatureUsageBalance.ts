import {
	ACTIVE_STATUSES,
	cusEntsToAllowance,
	cusEntsToBalance,
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
	cusProductsToCusEnts,
	type FullCusProduct,
} from "@autumn/shared";

export interface FeatureUsageBalanceParams {
	cusProducts: FullCusProduct[];
	featureId: string;
	entityId?: string | null;
}

export interface FeatureUsageBalanceResult {
	allowance: number;
	initialAllowance: number;
	balance: number;
	shouldShowOutOfBalance: boolean;
	shouldShowUsed: boolean;
	isUnlimited: boolean;
	usageType: string | undefined;
	quantity: number;
	cusEntsCount: number;
}

/**
 * Calculates feature usage balance metrics from customer products
 */
export function useFeatureUsageBalance({
	cusProducts,
	featureId,
	entityId,
}: FeatureUsageBalanceParams): FeatureUsageBalanceResult {
	const cusEnts = cusProductsToCusEnts({
		cusProducts,
		featureIds: [featureId],
		inStatuses: ACTIVE_STATUSES,
	});

	//without manual update adjustment, no rollovers
	const initialAllowance = cusEntsToAllowance({
		cusEnts,
		entityId: entityId ?? undefined,
		withRollovers: false,
	});

	//includes manual update adjustment
	const allowance = cusEntsToGrantedBalance({
		cusEnts,
		entityId: entityId ?? undefined,
		withRollovers: true,
	});

	const prepaidAllowance = cusEntsToPrepaidQuantity({ cusEnts });

	const balance = cusEntsToBalance({
		cusEnts,
		entityId: entityId ?? undefined,
		withRollovers: true,
	});

	const shouldShowOutOfBalance =
		allowance + prepaidAllowance > 0 || balance > 0;
	const shouldShowUsed =
		balance < 0 || ((balance ?? 0) === 0 && (allowance ?? 0) <= 0);

	const isUnlimited = cusEnts.some((e) => e.unlimited);
	const usageType = cusEnts[0]?.entitlement?.feature?.config?.usage_type;
	const quantity = cusEnts.reduce(
		(sum, e) => sum + (e.customer_product?.quantity ?? 1),
		0,
	);

	return {
		allowance: allowance + prepaidAllowance,
		initialAllowance: initialAllowance + prepaidAllowance,
		balance: balance ?? 0,
		shouldShowOutOfBalance,
		shouldShowUsed,
		isUnlimited,
		usageType,
		quantity,
		cusEntsCount: cusEnts.length,
	};
}
