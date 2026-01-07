import { InternalError, type UpdateSubscriptionV0Params } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { AutumnBillingPlan } from "../../types/billingPlan";
import type { UpdateSubscriptionBillingContext } from "../../billingContext";
import { computeQuantityUpdateDetails } from "./computeQuantityUpdateDetails";

export const computeSubscriptionUpdateQuantityPlan = ({
	ctx,
	updateSubscriptionContext,
	params,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV0Params;
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

	const lineItems = quantityUpdateDetails.flatMap(
		(detail) => detail.lineItems,
	);

	return {
		insertCustomerProducts: [],
		customPrices: [],
		customEntitlements: [],
		updateCustomerProduct: {
			...customerProduct,
			options: newOptions,

			// If quantity is being updated, customer product should be uncanceled
			canceled: false,
			canceled_at: null,
			ended_at: null,
		},

		updateCustomerEntitlements: quantityUpdateDetails.map((detail) => ({
			customerEntitlementId: detail.customerEntitlementId,
			balanceChange: detail.customerEntitlementBalanceChange,
		})),

		lineItems,
		// quantityUpdateDetails,
	};
};
