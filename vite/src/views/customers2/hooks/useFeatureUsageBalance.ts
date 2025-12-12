import {
	cusEntsToAdjustment,
	cusEntsToAllowance,
	cusEntsToBalance,
	cusEntsToGrantedBalance,
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
		featureId,
	});

	//without adjustment, no rollovers
	const initialAllowance = cusEntsToAllowance({
		cusEnts,
		entityId: entityId ?? undefined,
		withRollovers: false,
	});

	//includes adjustment
	const allowance = cusEntsToGrantedBalance({
		cusEnts,
		entityId: entityId ?? undefined,
		withRollovers: true,
	});

	const adjustment = cusEntsToAdjustment({
		cusEnts,
		entityId: entityId ?? undefined,
	});

	if (featureId === "open_ai_input_tokens_gpt_51") {
		console.log("Cus ents:", cusEnts);
		// console.log("allowance", allowance);
		// console.log("initialAllowance", initialAllowance);
		// console.log("adjustment:", adjustment);
	}

	const balance = cusEntsToBalance({
		cusEnts,
		entityId: entityId ?? undefined,
		withRollovers: true,
	});

	const shouldShowOutOfBalance = allowance > 0 || (balance ?? 0) > 0;
	const shouldShowUsed =
		balance < 0 || ((balance ?? 0) === 0 && (allowance ?? 0) <= 0);

	const isUnlimited = cusEnts.some((e) => e.unlimited);
	const usageType = cusEnts[0]?.entitlement?.feature?.config?.usage_type;
	const quantity = cusEnts.reduce(
		(sum, e) => sum + (e.customer_product.quantity ?? 1),
		0,
	);

	return {
		allowance: allowance ?? 0,
		initialAllowance: initialAllowance ?? 0,
		balance: balance ?? 0,
		shouldShowOutOfBalance,
		shouldShowUsed,
		isUnlimited,
		usageType,
		quantity,
		cusEntsCount: cusEnts.length,
	};
}
