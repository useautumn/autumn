import {
	type FullCusProduct,
	type FullCustomer,
	findMainActiveCustomerProductByGroup,
} from "@autumn/shared";
import type { SubscriptionMatch } from "@/internal/billing/v2/actions/sync/detect/types.js";

/** The active main plan this sync would replace, when it belongs to a
 * different Stripe subscription — a second sub must not take it over. */
export const findPlanLinkedToAnotherSubscription = ({
	match,
	fullCustomer,
	stripeSubscriptionId,
}: {
	match: SubscriptionMatch;
	fullCustomer: FullCustomer;
	stripeSubscriptionId: string;
}): FullCusProduct | undefined => {
	const currentPhase = match.phaseMatches.find((phase) => phase.is_current);

	for (const { product } of currentPhase?.plans ?? []) {
		if (product.is_add_on) continue;

		const currentCustomerProduct = findMainActiveCustomerProductByGroup({
			fullCus: fullCustomer,
			productGroup: product.group,
		});
		const linkedSubscriptionIds =
			currentCustomerProduct?.subscription_ids ?? [];
		const belongsToAnotherSubscription =
			linkedSubscriptionIds.length > 0 &&
			!linkedSubscriptionIds.includes(stripeSubscriptionId);

		if (belongsToAnotherSubscription) return currentCustomerProduct;
	}

	return undefined;
};
