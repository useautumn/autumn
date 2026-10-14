import type {
	BillingContext,
	BillingPlan,
	CustomLineItem,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { ErrCode, isCustomerProductOneOff, RecaseError } from "@autumn/shared";
import { classifyFirstPhaseStart } from "@/internal/billing/v2/actions/setPlans/setup/classifyFirstPhaseStart";
import { willStripeSubscriptionUpdateCreateInvoice } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/willStripeSubscriptionUpdateCreateInvoice";
import { isCustomLineItem } from "@/internal/billing/v2/utils/lineItems/isCustomLineItem";

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

const isScheduledForEndOfCycle = ({
	billingContext,
}: {
	billingContext: BillingContext;
}) =>
	"planTiming" in billingContext &&
	billingContext.planTiming === "end_of_cycle";

const billsGeneratedLinesNow = ({
	billingPlan,
}: {
	billingPlan: BillingPlan;
}) =>
	(billingPlan.autumn.lineItems ?? []).some(
		(lineItem) =>
			lineItem.chargeImmediately &&
			!isCustomLineItem(lineItem) &&
			lineItem.amount !== 0,
	);

/** Why add_lines has nothing billed now to ride on, or undefined when it has. */
const addLinesBlockReason = ({
	billingContext,
	billingPlan,
}: {
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}): string | undefined => {
	if (isScheduledForEndOfCycle({ billingContext })) {
		return "this request schedules the change for the end of the cycle";
	}

	const { billingStartsAt, currentEpochMs } = billingContext;
	if (
		billingStartsAt !== undefined &&
		classifyFirstPhaseStart({ startsAt: billingStartsAt, currentEpochMs }) ===
			"future"
	) {
		return "billing starts later";
	}

	if (billingPlan.stripe?.checkoutSessionAction) {
		const hasNegativeLine = billingContext.invoiceLineEdits?.addLines.some(
			(line) => line.amount < 0,
		);
		return hasNegativeLine
			? "Stripe Checkout can't take negative add_lines"
			: undefined;
	}

	const subAction = billingPlan.stripe?.subscriptionAction;
	if (subAction?.type === "create") return undefined;
	if (
		subAction?.type === "update" &&
		willStripeSubscriptionUpdateCreateInvoice({
			billingContext,
			stripeSubscriptionAction: subAction,
		})
	) {
		return undefined;
	}

	if (billsGeneratedLinesNow({ billingPlan })) return undefined;

	return "this request bills nothing now";
};

/** Why this request has no Autumn-built invoice to remove lines from, or undefined when it has one. */
const removeLinesBlockReason = ({
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

	if (isScheduledForEndOfCycle({ billingContext })) {
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

const offersInvoiceLineEdits = ({
	billingContext,
	billingPlan,
}: {
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) =>
	!billingPlan.autumn.customLineItems?.length &&
	!skipsInvoiceLineEdits({ billingContext });

/** Whether the dashboard can offer remove controls on this preview. */
export const invoiceLinesRemovable = ({
	billingContext,
	billingPlan,
}: {
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) =>
	offersInvoiceLineEdits({ billingContext, billingPlan }) &&
	removeLinesBlockReason({ billingContext, billingPlan }) === undefined;

/** Whether the dashboard can offer the add control on this preview. */
export const invoiceLinesAddable = ({
	billingContext,
	billingPlan,
}: {
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) =>
	offersInvoiceLineEdits({ billingContext, billingPlan }) &&
	addLinesBlockReason({ billingContext, billingPlan }) === undefined;

/** remove_lines only patches an invoice Autumn builds; add_lines rides on anything billed now. */
export const handleInvoiceLineEditsErrors = ({
	params,
	billingContext,
	billingPlan,
}: {
	params: { custom_line_items?: CustomLineItem[] };
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) => {
	const { invoiceLineEdits } = billingContext;
	if (!invoiceLineEdits) return;

	if (params.custom_line_items?.length) {
		throw invalidRequest(
			"custom_line_items replaces all lines; it can't be combined with add_lines or remove_lines",
		);
	}

	// "none" on an existing subscription drops every line billed now, edits included.
	if (
		skipsInvoiceLineEdits({ billingContext }) &&
		billingContext.stripeSubscription
	) {
		return;
	}

	if (invoiceLineEdits.removeLines.length > 0) {
		const reason = removeLinesBlockReason({ billingContext, billingPlan });
		if (reason) {
			throw invalidRequest(
				`remove_lines needs a change billed immediately on an existing subscription; ${reason}`,
			);
		}
	}

	if (invoiceLineEdits.addLines.length > 0) {
		const reason = addLinesBlockReason({ billingContext, billingPlan });
		if (reason) {
			throw invalidRequest(`add_lines needs a charge billed now; ${reason}`);
		}
	}
};
