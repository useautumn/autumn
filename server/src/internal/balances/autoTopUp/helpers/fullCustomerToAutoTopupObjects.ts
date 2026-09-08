import {
	type AutoTopup,
	cusEntsToBalance,
	cusEntToCusPrice,
	cusEntToInvoiceOverage,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	fullCustomerToPlanProducts,
	isOneOffPrice,
	isPrepaidPrice,
	isVolumeBasedCusEnt,
	resolveBillingControlWithProduct,
} from "@autumn/shared";

const getThreshold = (cusEnt: FullCusEntWithFullCusProduct) =>
	cusEntToCusPrice({ cusEnt })?.price.config.threshold_billing?.threshold;

const isThresholdEntitlement = (cusEnt: FullCusEntWithFullCusProduct) =>
	getThreshold(cusEnt) !== undefined;

const isOneOffPrepaid = (cusEnt: FullCusEntWithFullCusProduct) => {
	const customerPrice = cusEntToCusPrice({ cusEnt });
	return Boolean(
		customerPrice &&
			isOneOffPrice(customerPrice.price) &&
			isPrepaidPrice(customerPrice.price) &&
			!isVolumeBasedCusEnt(cusEnt),
	);
};

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

	let autoTopupConfig = resolved?.control;

	// 2. Find cusEnts for this feature
	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	if (cusEnts.length === 0) return null;
	if (!autoTopupConfig) {
		const thresholdEntitlement = cusEnts.find(isThresholdEntitlement);
		const threshold = thresholdEntitlement
			? (getThreshold(thresholdEntitlement) ?? 0)
			: 0;
		if (!thresholdEntitlement || threshold <= 0) return null;
		autoTopupConfig = {
			feature_id: featureId,
			enabled: true,
			threshold: -threshold,
			quantity: threshold,
		};
	}

	// 3. Find the one-off prepaid cusEnt whose price the top-up charges.
	const sourceProductInternalId =
		resolved?.customerProduct?.internal_product_id;
	let customerEntitlement: FullCusEntWithFullCusProduct | undefined;
	if (sourceProductInternalId) {
		// Plan-scoped config charges ONLY its own plan's price — never another
		// plan's price for the same feature, and no fallback if that plan lacks one.
		customerEntitlement = cusEnts.find(
			(ce) =>
				ce.customer_product?.internal_product_id === sourceProductInternalId &&
				isOneOffPrepaid(ce),
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
		const thresholdCustomerEntitlement = cusEnts.find(isThresholdEntitlement);
		if (thresholdCustomerEntitlement?.customer_product) {
			customerEntitlement = thresholdCustomerEntitlement;
		} else {
			return null;
		}
	}

	// 4. Check balance against threshold
	const thresholdPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });
	const thresholdBilling = thresholdPrice?.price.config.threshold_billing;
	const remainingBalance = cusEntsToBalance({ cusEnts, withRollovers: true });
	const balanceBelowThreshold = thresholdBilling
		? cusEntToInvoiceOverage({ cusEnt: customerEntitlement }) >=
			thresholdBilling.threshold
		: remainingBalance <= autoTopupConfig.threshold;

	return { autoTopupConfig, customerEntitlement, balanceBelowThreshold };
};
