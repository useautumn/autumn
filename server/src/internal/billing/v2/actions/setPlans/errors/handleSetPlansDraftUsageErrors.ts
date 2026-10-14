import {
	type BillingPlan,
	type CreateScheduleBillingContext,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { filterUnbilledUsageLineItems } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/filterUnbilledUsageLineItems";
import { willStripeSubscriptionUpdateCreateInvoice } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/willStripeSubscriptionUpdateCreateInvoice";
import { invoiceModeToIssueMethod } from "@/internal/billing/v2/utils/invoiceMode/invoiceModeIssueMethod";

/** A draft accrued-usage invoice defers the subscription, whose own draft invoice then replays and re-bills the usage. */
export const handleSetPlansDraftUsageErrors = ({
	billingContext,
	billingPlan,
}: {
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
}) => {
	const { invoiceMode } = billingContext;
	if (!invoiceMode || invoiceModeToIssueMethod({ invoiceMode }) !== "draft") {
		return;
	}

	const { invoiceAction, subscriptionAction } = billingPlan.stripe;
	const subscriptionInvoices =
		subscriptionAction?.type === "create" ||
		willStripeSubscriptionUpdateCreateInvoice({
			billingContext,
			stripeSubscriptionAction: subscriptionAction,
		});
	const billsAccruedUsage =
		filterUnbilledUsageLineItems({ autumnBillingPlan: billingPlan.autumn })
			.length > 0;
	if (!invoiceAction || !subscriptionInvoices || !billsAccruedUsage) return;

	throw new RecaseError({
		message:
			"issue_method: draft isn't supported when set_plans would also bill accrued usage. Use issue_method: finalize or send.",
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
