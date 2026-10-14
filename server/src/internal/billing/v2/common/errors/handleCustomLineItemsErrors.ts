import type {
	BillingContext,
	BillingPlan,
	CustomLineItem,
} from "@autumn/shared";
import { ErrCode, RecaseError } from "@autumn/shared";
import { willStripeSubscriptionUpdateCreateInvoice } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/willStripeSubscriptionUpdateCreateInvoice";

export const handleCustomLineItemsErrors = ({
	params,
	billingContext,
	billingPlan,
}: {
	params: { custom_line_items?: CustomLineItem[] };
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) => {
	if (!params.custom_line_items?.length) return;

	if (
		"planTiming" in billingContext &&
		billingContext.planTiming === "end_of_cycle"
	) {
		throw new RecaseError({
			message:
				"custom_line_items can only be used when updating an existing subscription immediately (not for scheduled plan changes)",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const subAction = billingPlan.stripe?.subscriptionAction;

	if (!subAction || subAction.type !== "update") {
		throw new RecaseError({
			message:
				"custom_line_items can only be used when updating an existing subscription (not creating a new one)",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

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
