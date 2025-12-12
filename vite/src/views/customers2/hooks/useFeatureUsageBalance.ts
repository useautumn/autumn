import {
	cusEntToBalance,
	cusEntToIncludedUsage,
	cusProductsToCusEnts,
	type FullCusProduct,
	getCusEntBalance,
	notNullish,
	sumValues,
} from "@autumn/shared";

export interface FeatureUsageBalanceParams {
	cusProducts: FullCusProduct[];
	featureId: string;
	entityId?: string | null;
}

export interface FeatureUsageBalanceResult {
	allowance: number;
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

	const initialAllowance = sumValues(
		cusEnts.map((cusEnt) =>
			cusEntToIncludedUsage({
				cusEnt,
				entityId: entityId ?? undefined,
			}),
		),
	);

	const totalAdjustment = sumValues(
		cusEnts.map((cusEnt) => {
			const { adjustment } = getCusEntBalance({
				cusEnt,
				entityId,
			});
			return adjustment;
		}),
	);

	const allowance = initialAllowance + totalAdjustment;

	const balance = sumValues(
		cusEnts
			.map((cusEnt) =>
				cusEntToBalance({
					cusEnt,
					entityId: entityId ?? undefined,
					withRollovers: true,
				}),
			)
			.filter(notNullish),
	);

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
		balance: balance ?? 0,
		shouldShowOutOfBalance,
		shouldShowUsed,
		isUnlimited,
		usageType,
		quantity,
		cusEntsCount: cusEnts.length,
	};
}
