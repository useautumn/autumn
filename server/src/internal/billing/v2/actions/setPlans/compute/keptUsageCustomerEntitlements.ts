import {
	type CreateScheduleBillingContext,
	cusPriceToCusEnt,
	type Entitlement,
	type FullCusProduct,
	type FullCustomerEntitlement,
	isConsumablePrice,
	type Price,
} from "@autumn/shared";
import { isOnReplacedSubscription } from "../utils/isOnReplacedSubscription";
import { isUnbilledByStripe } from "../utils/isUnbilledByStripe";

/** Stripe leaves a metered item on the same price in place, so its usage stays for the period-end invoice. */
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
	// A reset now or an unbilled plan starts a new Stripe period, so the old usage is billed now, never carried.
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
	// A replaced row on a cancelled subscription ends with it; its usage never moves to the new one.
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
