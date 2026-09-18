import {
	type AutoTopup,
	cusEntsToBalance,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	fullCustomerToPlanProducts,
	isCustomerProductAddOn,
	isCustomerProductRecurring,
	isOneOffCustomerEntitlement,
	isPrepaidCustomerEntitlement,
	resolveBillingControlWithProduct,
} from "@autumn/shared";

/** Expiring grants are loose and carry no price, so they never match — but
 * the pin makes the intent explicit: the charge source is the plan's own row. */
const isChargeSource = (cusEnt: FullCusEntWithFullCusProduct) =>
	cusEnt.customer_product_id != null && cusEnt.expires_at == null;

/** Flat or tiered — the top-up quantity is priced through the item's tiers. */
const isOneOffPrepaid = (cusEnt: FullCusEntWithFullCusProduct) =>
	isOneOffCustomerEntitlement(cusEnt) && isPrepaidCustomerEntitlement(cusEnt);

/**
 * The plan a customer subscribes to states their refill rate; a top-up product
 * bought alongside it does not. Lower rank wins. `is_add_on` alone is too weak
 * a signal — a standalone top-up is commonly not flagged as one — so a
 * recurring price is the primary key and the add-on flag breaks the rest.
 */
const chargeSourceRank = (cusEnt: FullCusEntWithFullCusProduct) => {
	const customerProduct = cusEnt.customer_product ?? undefined;
	const recurring = isCustomerProductRecurring(customerProduct) ? 0 : 2;
	const addOn = isCustomerProductAddOn(customerProduct) ? 1 : 0;
	return recurring + addOn;
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

	const autoTopupConfig = resolved?.control;
	if (!autoTopupConfig?.enabled) return null;

	// 2. Find cusEnts for this feature
	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	if (cusEnts.length === 0) return null;

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
				isOneOffPrepaid(ce) &&
				isChargeSource(ce),
		);
	} else {
		// Customer-level config has no source plan, so rank the candidates: the
		// subscription plan's own price first, a standalone top-up only as a
		// fallback, and recency decides within a rank.
		customerEntitlement = cusEnts
			.filter((ce) => isOneOffPrepaid(ce) && isChargeSource(ce))
			.sort(
				(left, right) =>
					chargeSourceRank(left) - chargeSourceRank(right) ||
					(right.customer_product?.created_at ?? 0) -
						(left.customer_product?.created_at ?? 0),
			)[0];
	}

	if (!customerEntitlement?.customer_product) return null;

	// 4. Check balance against threshold
	const remainingBalance = cusEntsToBalance({ cusEnts, withRollovers: true });
	const balanceBelowThreshold = remainingBalance <= autoTopupConfig.threshold;

	return { autoTopupConfig, customerEntitlement, balanceBelowThreshold };
};
