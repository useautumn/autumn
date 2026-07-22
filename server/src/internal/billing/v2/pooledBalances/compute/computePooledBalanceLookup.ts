import {
	EntInterval,
	type PooledBalanceOp,
	PooledBalanceResetMode,
	PooledBalanceResetOwnerType,
	type RolloverConfig,
} from "@autumn/shared";

type PoolSourceOperation = Extract<
	PooledBalanceOp,
	{ op: "upsert_source" | "transfer_source" }
>;

export const pooledBalanceResetOwnerTypeToMode = ({
	resetOwnerType,
}: {
	resetOwnerType: PooledBalanceResetOwnerType;
}) =>
	resetOwnerType === PooledBalanceResetOwnerType.Subscription
		? PooledBalanceResetMode.Subscription
		: PooledBalanceResetMode.Lazy;

export const pooledRolloverToSignature = ({
	rollover,
}: {
	rollover?: RolloverConfig | null;
}) =>
	rollover
		? JSON.stringify({
				max: rollover.max ?? null,
				max_percentage: rollover.max_percentage ?? null,
				duration: rollover.duration,
				length: rollover.length,
			})
		: "none";

export const computePooledBalanceLookup = ({
	operation,
}: {
	operation: PoolSourceOperation;
}) => {
	const resetMode =
		operation.interval === EntInterval.Lifetime
			? PooledBalanceResetMode.Lifetime
			: pooledBalanceResetOwnerTypeToMode({
					resetOwnerType: operation.resetOwnerType,
				});

	return {
		internal_customer_id: operation.internalCustomerId,
		internal_feature_id: operation.internalFeatureId,
		interval: operation.interval,
		interval_count: operation.intervalCount,
		reset_cycle_anchor: operation.resetCycleAnchor,
		reset_mode: resetMode,
		rollover_signature: pooledRolloverToSignature({
			rollover: operation.rollover,
		}),
		price_id: operation.priceId,
	};
};
