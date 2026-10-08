import type { BillingContext, FullCusProduct } from "@autumn/shared";
import { filterOnReplacedStripeSubscription } from "../utils/filterOnReplacedStripeSubscription";
import { isBackdateRecreate } from "../utils/isBackdateRecreate";
import { paidBackdateAnchorMove } from "../utils/paidBackdateAnchorMove";

/**
 * Kept rows the replacement subscription carries onto its anchor. It bills them from now, as Stripe prorates them on
 * create; a paid backdate recreate already paid them, and only re-anchors them when its anchor moves.
 */
export const keptCustomerProductsOnNewAnchor = ({
	billingContext,
	keptCustomerProducts,
}: {
	billingContext: Pick<
		BillingContext,
		| "replacedStripeSubscription"
		| "subscriptionBackdateStartMs"
		| "requestedBillingCycleAnchor"
	>;
	keptCustomerProducts: FullCusProduct[];
}): {
	billedByReplacement: FullCusProduct[];
	reanchoredByPaidBackdate: FullCusProduct[];
} => {
	const onReplaced = filterOnReplacedStripeSubscription({
		billingContext,
		customerProducts: keptCustomerProducts,
	});
	if (!isBackdateRecreate({ billingContext })) {
		return { billedByReplacement: onReplaced, reanchoredByPaidBackdate: [] };
	}
	return {
		billedByReplacement: [],
		reanchoredByPaidBackdate: paidBackdateAnchorMove({ billingContext })
			? onReplaced
			: [],
	};
};
