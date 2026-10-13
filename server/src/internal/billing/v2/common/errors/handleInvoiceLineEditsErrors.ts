import type {
	BillingContext,
	BillingPlan,
	CustomLineItem,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { ErrCode, isCustomerProductOneOff, RecaseError } from "@autumn/shared";
import { willStripeSubscriptionUpdateCreateInvoice } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/willStripeSubscriptionUpdateCreateInvoice";

const invalidRequest = (message: string) =>
	new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});

/** Edits under "none" are skipped like custom_line_items, so they never block a request. */
const skipsInvoiceLineEdits = ({
	billingContext,
}: {
	billingContext: BillingContext;
}) => billingContext.requestedProrationBehavior === "none";

/** Why this request has no Autumn-built invoice to edit, or undefined when it has one. */
const invoiceLineEditsBlockReason = ({
	billingContext,
	billingPlan,
}: {
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}): string | undefined => {
	const { customerProduct } = billingContext as Partial<
		Pick<UpdateSubscriptionBillingContext, "customerProduct">
	>;
	if (customerProduct && isCustomerProductOneOff(customerProduct)) {
		return "one-off plans have no subscription invoice";
	}

	if (
		"planTiming" in billingContext &&
		billingContext.planTiming === "end_of_cycle"
	) {
		return "this request schedules the change for the end of the cycle";
	}

	const subAction = billingPlan.stripe?.subscriptionAction;
	if (subAction?.type === "create") {
		return "this request creates a new subscription";
	}
	if (subAction?.type !== "update") {
		return "this request doesn't bill an existing subscription now";
	}

	if (
		willStripeSubscriptionUpdateCreateInvoice({
			billingContext,
			stripeSubscriptionAction: subAction,
		})
	) {
		return "ending the trial makes Stripe bill this change";
	}

	return undefined;
};

/** Whether the dashboard can offer remove and add controls on this preview. */
export const invoiceLinesEditable = ({
	billingContext,
	billingPlan,
}: {
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) =>
	!billingPlan.autumn.customLineItems?.length &&
	!skipsInvoiceLineEdits({ billingContext }) &&
	invoiceLineEditsBlockReason({ billingContext, billingPlan }) === undefined;

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

	// An otherwise unchanged subscription under "none" needs no invoice at all.
	if (
		skipsInvoiceLineEdits({ billingContext }) &&
		billingContext.stripeSubscription &&
		!billingPlan.stripe?.subscriptionAction
	) {
		return;
	}

	const reason = invoiceLineEditsBlockReason({ billingContext, billingPlan });
	if (reason) {
		throw invalidRequest(
			`remove_lines and add_lines need a change billed immediately on an existing subscription; ${reason}`,
		);
	}
};
