import type { ApprovalAction, BillingContext } from "@autumn/shared";

/**
 * The approval action an update request performs. Cancel and uncancel are
 * their own actions, so a rule on "Update subscription" doesn't cover them.
 */
export const billingContextToUpdateAction = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): ApprovalAction => {
	if (billingContext.cancelAction === "uncancel") return "billing.uncancel";
	if (billingContext.cancelAction) return "billing.cancel";
	return "billing.update_subscription";
};
