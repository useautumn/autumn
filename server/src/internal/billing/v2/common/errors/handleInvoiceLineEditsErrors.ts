import type {
	BillingContext,
	BillingPlan,
	CustomLineItem,
} from "@autumn/shared";
import { ErrCode, RecaseError } from "@autumn/shared";
import { willStripeSubscriptionUpdateCreateInvoice } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/willStripeSubscriptionUpdateCreateInvoice";

const invalidRequest = (message: string) =>
	new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});

const needsAutumnInvoice = (reason: string) =>
	invalidRequest(
		`remove_lines and add_lines need a change billed immediately on an existing subscription; ${reason}`,
	);

/** add_lines / remove_lines only patch an invoice Autumn builds now, on an existing subscription. */
export const handleInvoiceLineEditsErrors = ({
	params,
	billingContext,
	billingPlan,
}: {
	params: { custom_line_items?: CustomLineItem[] };
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) => {
	if (!billingContext.invoiceLineEdits) return;

	if (params.custom_line_items?.length) {
		throw invalidRequest(
			"custom_line_items replaces all lines; it can't be combined with add_lines or remove_lines",
		);
	}

	const subAction = billingPlan.stripe?.subscriptionAction;

	// Under "none" the edits are skipped like custom_line_items, so an unchanged subscription needs no invoice.
	if (
		billingContext.stripeSubscription &&
		billingContext.requestedProrationBehavior === "none" &&
		!subAction
	) {
		return;
	}

	if (
		"planTiming" in billingContext &&
		billingContext.planTiming === "end_of_cycle"
	) {
		throw needsAutumnInvoice(
			"this request schedules the change for the end of the cycle",
		);
	}

	if (subAction?.type === "create") {
		throw needsAutumnInvoice("this request creates a new subscription");
	}

	if (subAction?.type !== "update") {
		throw needsAutumnInvoice(
			"this request doesn't bill an existing subscription now",
		);
	}

	if (
		willStripeSubscriptionUpdateCreateInvoice({
			billingContext,
			stripeSubscriptionAction: subAction,
		})
	) {
		throw needsAutumnInvoice("ending the trial makes Stripe bill this change");
	}
};
