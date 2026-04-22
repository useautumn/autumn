import {
	type AutoTopup,
	cusEntsToBalance,
	cusEntToCusPrice,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	isOneOffPrice,
	isPrepaidPrice,
	isVolumeBasedCusEnt,
} from "@autumn/shared";

/** Pure extraction of auto-topup-relevant objects from a FullCustomer. Returns null if any prerequisite is missing. */
export const fullCustomerToAutoTopupObjects = ({
	fullCustomer,
	featureId,
}: {
	fullCustomer: FullCustomer;
	featureId: string;
}): {
	autoTopupConfig: AutoTopup;
	customerEntitlement: FullCusEntWithFullCusProduct;
	/** All cusEnts for this feature on this customer — includes the prepaid one plus any
	 * reset-cycle / base / usage-allowed cusEnts. Passed through to the rebalancer so it
	 * can pay down overage before adding the top-up remainder to the prepaid cusEnt. */
	customerEntitlements: FullCusEntWithFullCusProduct[];
	balanceBelowThreshold: boolean;
} | null => {
	// 1. Find enabled auto_topup config
	const autoTopupConfig = fullCustomer.auto_topups?.find(
		(config) => config.feature_id === featureId && config.enabled,
	);

	if (!autoTopupConfig) return null;

	// 2. Find cusEnts for this feature
	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	if (cusEnts.length === 0) return null;

	// 3. Find the one-off prepaid cusEnt
	const customerEntitlement = cusEnts.find((ce) => {
		const cp = cusEntToCusPrice({ cusEnt: ce });
		return (
			cp &&
			isOneOffPrice(cp.price) &&
			isPrepaidPrice(cp.price) &&
			!isVolumeBasedCusEnt(ce)
		);
	});

	if (!customerEntitlement || !customerEntitlement.customer_product) {
		return null;
	}

	// 4. Check balance against threshold
	const remainingBalance = cusEntsToBalance({ cusEnts, withRollovers: true });
	const balanceBelowThreshold = remainingBalance <= autoTopupConfig.threshold;

	return {
		autoTopupConfig,
		customerEntitlement,
		customerEntitlements: cusEnts,
		balanceBelowThreshold,
	};
};
