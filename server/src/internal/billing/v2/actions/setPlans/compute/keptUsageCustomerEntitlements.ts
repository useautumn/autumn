import {
	type CreateScheduleBillingContext,
	cusPriceToCusEnt,
	type Entitlement,
	type FullCusProduct,
	type FullCustomerEntitlement,
	isConsumablePrice,
	isCustomerProductOnStripeSubscription,
	type Price,
} from "@autumn/shared";
import { isUnbilledByStripe } from "../utils/isUnbilledByStripe";

/** A replaced row on a cancelled subscription ends with it; its usage never moves to the new one. */
const isOnReplacedSubscription = ({
	billingContext,
	customerProduct,
}: {
	billingContext: CreateScheduleBillingContext;
	customerProduct: FullCusProduct;
}) => {
	const replacedSubscriptionId = billingContext.replacedStripeSubscription?.id;
	return (
		replacedSubscriptionId !== undefined &&
		isCustomerProductOnStripeSubscription({
			customerProduct,
			stripeSubscriptionId: replacedSubscriptionId,
		}) === true
	);
};

/**
 * Usage rows the replacement keeps on the same usage price and allowance. Stripe leaves such a metered item in
 * place, so its usage stays for the period-end invoice; a reset now closes that period and bills it instead.
 */
export const keptUsageCustomerEntitlements = ({
	billingContext,
	outgoingCustomerProduct,
	incomingPrices,
	incomingEntitlements,
}: {
	billingContext: CreateScheduleBillingContext;
	outgoingCustomerProduct: FullCusProduct;
	incomingPrices: Price[];
	incomingEntitlements: Entitlement[];
}): FullCustomerEntitlement[] => {
	// Both start a new Stripe period, so the old one's usage is billed now, never carried.
	const resetsCycleNow = billingContext.requestedBillingCycleAnchor === "now";
	if (resetsCycleNow) return [];
	if (
		isUnbilledByStripe({
			customerProduct: outgoingCustomerProduct,
			now: billingContext.currentEpochMs,
		})
	) {
		return [];
	}
	if (
		isOnReplacedSubscription({
			billingContext,
			customerProduct: outgoingCustomerProduct,
		})
	) {
		return [];
	}

	const incomingPriceIds = new Set(incomingPrices.map((price) => price.id));
	const incomingEntitlementIds = new Set(
		incomingEntitlements.map((entitlement) => entitlement.id),
	);

	return outgoingCustomerProduct.customer_prices.flatMap((customerPrice) => {
		if (!isConsumablePrice(customerPrice.price)) return [];
		if (!incomingPriceIds.has(customerPrice.price.id)) return [];

		const customerEntitlement = cusPriceToCusEnt({
			cusPrice: customerPrice,
			cusEnts: outgoingCustomerProduct.customer_entitlements,
		});
		const keepsAllowance =
			customerEntitlement !== undefined &&
			incomingEntitlementIds.has(customerEntitlement.entitlement.id);
		return keepsAllowance ? [customerEntitlement] : [];
	});
};
