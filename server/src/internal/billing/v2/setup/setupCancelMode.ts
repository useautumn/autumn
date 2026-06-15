import type {
	CancelAction,
	FullCusProduct,
	Organization,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { CusProductStatus } from "@autumn/shared";

// past_due end-of-cycle resolves to immediate: no paid period left to honor.
const shouldForcePastDueImmediateCancel = ({
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

// No refund for a past_due immediate cancel: the customer never paid the cycle being voided.
export const shouldSuppressUnpaidCycleCredit = ({
	cancelAction,
	org,
	customerProduct,
}: {
	cancelAction: CancelAction | undefined;
	org: Organization;
	customerProduct?: FullCusProduct;
}): boolean =>
	cancelAction === "cancel_immediately" &&
	org.config.void_invoices_on_subscription_deletion &&
	customerProduct?.status === CusProductStatus.PastDue;
