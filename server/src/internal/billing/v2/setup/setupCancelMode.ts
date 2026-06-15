import type {
	CancelAction,
	FullCusProduct,
	Organization,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { CusProductStatus } from "@autumn/shared";

// Void-on-cancel orgs cancel a past_due end-of-cycle request immediately: the customer is in a
// cycle they never paid for, so there is no paid period to honor. The unpaid invoice is voided
// downstream (voidInvoicesOnImmediateCancel) and proration credits are suppressed by the caller
// (no refund is owed for a cycle that was never paid).
export const shouldForcePastDueImmediateCancel = ({
	params,
	org,
	customerProduct,
}: {
	params: UpdateSubscriptionV1Params;
	org: Organization;
	customerProduct?: FullCusProduct;
}): boolean =>
	params.cancel_action === "cancel_end_of_cycle" &&
	org.config.void_invoices_on_subscription_deletion &&
	customerProduct?.status === CusProductStatus.PastDue;

export const setupCancelAction = ({
	params,
	org,
	customerProduct,
}: {
	params: UpdateSubscriptionV1Params;
	org: Organization;
	customerProduct?: FullCusProduct;
}): CancelAction | undefined =>
	shouldForcePastDueImmediateCancel({ params, org, customerProduct })
		? "cancel_immediately"
		: params.cancel_action;
