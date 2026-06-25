import {
	type AutoTopup,
	cusEntsToBalance,
	cusEntToCusPrice,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	fullCustomerToPlanProducts,
	isOneOffPrice,
	isPrepaidPrice,
	isVolumeBasedCusEnt,
	resolveBillingControlWithProduct,
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
	balanceBelowThreshold: boolean;
} | null => {
	// 1. Find enabled auto_topup config (and the plan it resolved from, if any)
	const resolved = resolveBillingControlWithProduct<AutoTopup, "auto_topups">({
		controlLists: [fullCustomer.auto_topups],
		customerProducts: fullCustomerToPlanProducts({ fullCustomer }),
		controlKey: "auto_topups",
		matches: (config) => config.feature_id === featureId,
	});

	const autoTopupConfig = resolved?.control;
	if (!autoTopupConfig?.enabled) return null;

	// 2. Find cusEnts for this feature
	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	if (cusEnts.length === 0) return null;

	// 3. Find the one-off prepaid cusEnt whose price the top-up charges.
	const sourceProductInternalId = resolved?.customerProduct?.internal_product_id;
	const isOneOffPrepaid = (ce: FullCusEntWithFullCusProduct) => {
		const cp = cusEntToCusPrice({ cusEnt: ce });
		return (
			cp &&
			isOneOffPrice(cp.price) &&
			isPrepaidPrice(cp.price) &&
			!isVolumeBasedCusEnt(ce)
		);
	};

	let customerEntitlement: FullCusEntWithFullCusProduct | undefined;
	if (sourceProductInternalId) {
		// Plan-scoped config charges ONLY its own plan's price — never another
		// plan's price for the same feature, and no fallback if that plan lacks one.
		customerEntitlement = cusEnts.find(
			(ce) =>
				ce.customer_product?.internal_product_id ===
					sourceProductInternalId && isOneOffPrepaid(ce),
		);
	} else {
		// Customer-level config has no source plan, so charge the MOST RECENTLY
		// attached plan's one-off price.
		customerEntitlement = cusEnts
			.filter(isOneOffPrepaid)
			.sort(
				(left, right) =>
					(right.customer_product?.created_at ?? 0) -
					(left.customer_product?.created_at ?? 0),
			)[0];
	}

	if (!customerEntitlement || !customerEntitlement.customer_product) {
		return null;
	}

	// 4. Check balance against threshold
	const remainingBalance = cusEntsToBalance({ cusEnts, withRollovers: true });
	const balanceBelowThreshold = remainingBalance <= autoTopupConfig.threshold;

	return { autoTopupConfig, customerEntitlement, balanceBelowThreshold };
};
