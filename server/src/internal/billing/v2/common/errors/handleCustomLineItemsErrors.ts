import type {
	AttachParamsV1,
	BillingContext,
	BillingPlan,
} from "@autumn/shared";
import { ErrCode, RecaseError } from "@autumn/shared";
import { willStripeSubscriptionUpdateCreateInvoice } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/willStripeSubscriptionUpdateCreateInvoice";

/**
 * Validates that custom_line_items is only used in valid scenarios:
 * 1. The stripe subscription action must be "update" (not "create")
 * 2. The update must not create a Stripe-managed invoice (e.g. trial removal)
 */
export const handleCustomLineItemsErrors = ({
	params,
	billingContext,
	billingPlan,
}: {
	params: AttachParamsV1;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) => {
	if (!params.custom_line_items?.length) return;

	const subAction = billingPlan.stripe?.subscriptionAction;

	// 1. Only allowed for subscription updates (not creates, cancels, etc.)
	if (!subAction || subAction.type !== "update") {
		throw new RecaseError({
			message:
				"custom_line_items can only be used when updating an existing subscription (not creating a new one)",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// 2. Not allowed when the update creates a Stripe-managed invoice (trial removal)
	if (
		willStripeSubscriptionUpdateCreateInvoice({
			billingContext,
			stripeSubscriptionAction: subAction,
		})
	) {
		throw new RecaseError({
			message:
				"custom_line_items cannot be used when the subscription update creates a Stripe-managed invoice (e.g. removing a trial)",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
