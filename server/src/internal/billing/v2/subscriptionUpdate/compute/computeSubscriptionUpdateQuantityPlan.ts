import { InternalError, type SubscriptionUpdateV0Params } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { AutumnBillingPlan } from "../../billingPlan";
import type { UpdateSubscriptionContext } from "../fetch/updateSubscriptionContextSchema";
import { computeQuantityUpdateDetails } from "./computeQuantityUpdateDetails";

export const computeSubscriptionUpdateQuantityPlan = ({
	ctx,
	updateSubscriptionContext,
	params,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionContext;
	params: SubscriptionUpdateV0Params;
}): AutumnBillingPlan => {
	const { customerProduct, stripeSubscription } = updateSubscriptionContext;

	if (!stripeSubscription) {
		throw new InternalError({
			message: `[Subscription Update] Stripe subscription not found`,
		});
	}

	const newOptions = params.options || [];

	const quantityUpdateDetails = newOptions.map((updatedOptions) =>
		computeQuantityUpdateDetails({
			ctx,
			updatedOptions,
			updateSubscriptionContext,
		}),
	);

	const autumnLineItems = quantityUpdateDetails.flatMap(
		(detail) => detail.autumnLineItems,
	);

	return {
		insertCustomerProducts: [],
		customPrices: [],
		customEntitlements: [],
		updateCustomerProduct: {
			...customerProduct,
			options: newOptions,
		},
		autumnLineItems,
		quantityUpdateDetails,
		shouldUncancelSubscription: customerProduct.canceled === true,
	};
};
