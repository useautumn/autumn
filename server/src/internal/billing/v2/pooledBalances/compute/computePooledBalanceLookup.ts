import {
	EntInterval,
	type PooledBalanceOp,
	PooledBalanceResetMode,
	rolloverToSignature,
} from "@autumn/shared";

type PoolSourceOperation = Extract<
	PooledBalanceOp,
	{ op: "upsert_source" | "transfer_source" }
>;

export const contributionOwnerToResetMode = ({
	stripeSubscriptionId,
}: {
	stripeSubscriptionId: string | null;
}) =>
	stripeSubscriptionId
		? PooledBalanceResetMode.Subscription
		: PooledBalanceResetMode.Lazy;

export const computePooledBalanceLookup = ({
	operation,
}: {
	operation: PoolSourceOperation;
}) => ({
	internal_customer_id: operation.internalCustomerId,
	internal_feature_id: operation.internalFeatureId,
	interval: operation.interval,
	interval_count: operation.intervalCount,
	reset_cycle_anchor: operation.resetCycleAnchor,
	// Lifetime pools never reset (null next_reset_at); a fixed mode keeps
	// differently-owned lifetime grants coalescing into one pool.
	reset_mode:
		operation.interval === EntInterval.Lifetime
			? PooledBalanceResetMode.Lazy
			: contributionOwnerToResetMode({
					stripeSubscriptionId: operation.stripeSubscriptionId,
				}),
	rollover_signature: rolloverToSignature({
		rollover: operation.rollover,
	}),
});
