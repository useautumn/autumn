import type { PooledBalanceIdentity } from "../../../models/pooledBalanceModels/pooledBalanceIdentity.js";

export const pooledBalanceIdentityToKey = ({
	identity,
}: {
	identity: PooledBalanceIdentity;
}) =>
	JSON.stringify([
		identity.internalFeatureId,
		identity.interval,
		identity.intervalCount,
		identity.resetCycleAnchor,
		identity.resetMode,
		identity.stripeSubscriptionId,
		identity.customerLicenseLinkId,
		identity.rolloverSignature,
	]);
