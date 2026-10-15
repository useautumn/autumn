import type { ApprovalAction } from "@autumn/shared";

/** A `billing.update` body's approval action, as `billingContextToUpdateAction` reads it after setup. */
export const updateRequestToApprovalAction = ({
	body,
}: {
	body: unknown;
}): ApprovalAction => {
	const cancelAction =
		typeof body === "object" && body !== null && "cancel_action" in body
			? body.cancel_action
			: undefined;
	if (cancelAction === "uncancel") return "billing.uncancel";
	if (cancelAction) return "billing.cancel";
	return "billing.update_subscription";
};
