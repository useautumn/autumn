import {
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
	UpdateSubscriptionPreviewIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";

export const billingPlanToUpdateSubscriptionPreviewIntent = ({
	params,
	billingContext,
}: {
	params: UpdateSubscriptionV1Params;
	billingContext: UpdateSubscriptionBillingContext;
}) => {
	switch (billingContext.intent) {
		case UpdateSubscriptionIntent.UpdateQuantity:
			return UpdateSubscriptionPreviewIntent.UpdateQuantity;
		case UpdateSubscriptionIntent.UpdatePlan:
			return UpdateSubscriptionPreviewIntent.UpdatePlan;
		case UpdateSubscriptionIntent.CancelAction: {
			if (params.cancel_action === "cancel_immediately") {
				return UpdateSubscriptionPreviewIntent.CancelImmediately;
			}
			if (params.cancel_action === "cancel_end_of_cycle") {
				return UpdateSubscriptionPreviewIntent.CancelEndOfCycle;
			}
			if (params.cancel_action === "uncancel") {
				return UpdateSubscriptionPreviewIntent.Uncancel;
			}
			return UpdateSubscriptionPreviewIntent.None;
		}

		case UpdateSubscriptionIntent.None:
			return UpdateSubscriptionPreviewIntent.None;
	}
};
