import type { PooledBalanceIdentity } from "../../../models/pooledBalanceModels/pooledBalanceIdentity.js";
import type { DbPooledBalance } from "../../../models/pooledBalanceModels/pooledBalanceTable.js";

export const pooledBalanceToPooledBalanceIdentity = ({
	pooledBalance,
}: {
	pooledBalance: DbPooledBalance;
}): PooledBalanceIdentity => ({
	internalFeatureId: pooledBalance.internal_feature_id,
	interval: pooledBalance.interval,
	intervalCount: pooledBalance.interval_count,
	resetCycleAnchor: pooledBalance.reset_cycle_anchor,
	resetMode: pooledBalance.reset_mode,
	stripeSubscriptionId: pooledBalance.stripe_subscription_id,
	customerLicenseLinkId: pooledBalance.customer_license_link_id,
	rolloverSignature: pooledBalance.rollover_signature,
});
