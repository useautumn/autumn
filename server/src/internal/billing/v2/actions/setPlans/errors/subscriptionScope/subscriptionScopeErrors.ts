import {
	customerProductHasRelevantStatus,
	customerProductsToMainPlanName,
	type FullCusProduct,
	type SetPlansSubscriptionConflict,
} from "@autumn/shared";
import { setPlansError } from "../setPlansError";

/** The subscription's display name: its main plan, as the dashboard names it. */
export const stripeSubscriptionPlanName = ({
	customerProducts,
	stripeSubscriptionId,
}: {
	customerProducts: FullCusProduct[];
	stripeSubscriptionId: string;
}) =>
	customerProductsToMainPlanName({
		customerProducts: customerProducts.filter(
			(customerProduct) =>
				customerProductHasRelevantStatus(customerProduct) &&
				customerProduct.subscription_ids?.includes(stripeSubscriptionId),
		),
	}) ?? "current";

/** A targeted request would change a plan billed somewhere other than the target. */
export const subscriptionConflictError = ({
	customerProducts,
	conflict,
	requestedPlanName,
	conflictingCustomerProduct,
}: {
	customerProducts: FullCusProduct[];
	conflict: SetPlansSubscriptionConflict["conflict"];
	requestedPlanName: string;
	conflictingCustomerProduct: FullCusProduct;
}) => {
	const [stripeSubscriptionId] =
		conflictingCustomerProduct.subscription_ids ?? [];
	if (!stripeSubscriptionId) {
		return setPlansError({
			details: {
				type: "plan_outside_subscription",
				requested_plan_name: requestedPlanName,
			},
		});
	}

	return setPlansError({
		details: {
			type: "plan_on_another_subscription",
			conflict,
			requested_plan_name: requestedPlanName,
			conflicting_plan_name: conflictingCustomerProduct.product.name,
			stripe_subscription_id: stripeSubscriptionId,
			subscription_plan_name: stripeSubscriptionPlanName({
				customerProducts,
				stripeSubscriptionId,
			}),
		},
	});
};
