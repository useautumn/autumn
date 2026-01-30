import {
	ACTIVE_STATUSES,
	cusEntsToAllowance,
	cusEntsToBalance,
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	nullish,
} from "@autumn/shared";

export interface FeatureUsageBalanceParams {
	fullCustomer: FullCustomer | null | undefined;
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
 * Calculates feature usage balance metrics from full customer (includes extra entitlements)
 */
export function useFeatureUsageBalance({
	fullCustomer,
	featureId,
	entityId,
}: FeatureUsageBalanceParams): FeatureUsageBalanceResult {
	const cusEnts = fullCustomer
		? fullCustomerToCustomerEntitlements({
				fullCustomer,
				featureId,
				inStatuses: ACTIVE_STATUSES,
			})
		: [];

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

	const prepaidAllowance = cusEntsToPrepaidQuantity({
		cusEnts,
		sumAcrossEntities: nullish(entityId),
	});

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
