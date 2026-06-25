import { BillingInterval } from "../../../models/productModels/intervals/billingInterval";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { getCycleEnd } from "../../billingUtils/cycleUtils/getCycleEnd";
import { customerEntitlementHasDifferentResetAndPriceInterval } from "../classifyCusEntUtils";
import { cusEntToCusPrice } from "./cusEntToCusPrice";

export const customerEntitlementToBillingCycleEnd = ({
	customerEntitlement,
	now,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
	now: number;
}): number | null => {
	const customerProduct = customerEntitlement.customer_product;
	if (!customerProduct) return null;

	const customerPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });
	if (!customerPrice) return null;

	if (
		!customerEntitlementHasDifferentResetAndPriceInterval({
			customerEntitlement,
			customerPrice,
		})
	) {
		return null;
	}

	const priceConfig = customerPrice.price.config;
	if (priceConfig.interval === BillingInterval.OneOff) return null;

	const futureTrialEndsAt =
		customerProduct.trial_ends_at != null && customerProduct.trial_ends_at > now
			? customerProduct.trial_ends_at
			: undefined;
	const anchor =
		futureTrialEndsAt ??
		customerProduct.billing_cycle_anchor ??
		customerProduct.starts_at;
	if (anchor == null) return null;

	return getCycleEnd({
		anchor,
		interval: priceConfig.interval,
		intervalCount: priceConfig.interval_count ?? 1,
		now,
		floor: futureTrialEndsAt,
	});
};
