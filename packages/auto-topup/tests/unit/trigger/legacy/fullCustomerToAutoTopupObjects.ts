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

const isChargeSource = (cusEnt: FullCusEntWithFullCusProduct) =>
	cusEnt.customer_product_id != null && cusEnt.expires_at == null;

const isOneOffPrepaid = (cusEnt: FullCusEntWithFullCusProduct) =>
	isOneOffCustomerEntitlement(cusEnt) && isPrepaidCustomerEntitlement(cusEnt);

const chargeSourceRank = (cusEnt: FullCusEntWithFullCusProduct) => {
	const customerProduct = cusEnt.customer_product ?? undefined;
	const recurring = isCustomerProductRecurring(customerProduct) ? 0 : 2;
	const addOn = isCustomerProductAddOn(customerProduct) ? 1 : 0;
	return recurring + addOn;
};

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
	const resolved = resolveBillingControlWithProduct({
		controlLists: [fullCustomer.auto_topups],
		customerProducts: fullCustomerToPlanProducts({ fullCustomer }),
		controlKey: "auto_topups",
		matches: (config) => config.feature_id === featureId,
	});

	const autoTopupConfig = resolved?.control;
	if (!autoTopupConfig?.enabled) return null;

	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	if (cusEnts.length === 0) return null;

	const sourceProductInternalId =
		resolved?.customerProduct?.internal_product_id;
	let customerEntitlement: FullCusEntWithFullCusProduct | undefined;
	if (sourceProductInternalId) {
		customerEntitlement = cusEnts.find(
			(ce) =>
				ce.customer_product?.internal_product_id === sourceProductInternalId &&
				isOneOffPrepaid(ce) &&
				isChargeSource(ce),
		);
	} else {
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

	const remainingBalance = cusEntsToBalance({ cusEnts, withRollovers: true });
	const balanceBelowThreshold = remainingBalance <= autoTopupConfig.threshold;

	return { autoTopupConfig, customerEntitlement, balanceBelowThreshold };
};
