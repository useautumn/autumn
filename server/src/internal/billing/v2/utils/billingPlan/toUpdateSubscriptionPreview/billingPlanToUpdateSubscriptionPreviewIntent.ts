import {
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
	UpdateSubscriptionPreviewIntent,
} from "@autumn/shared";

export const billingPlanToUpdateSubscriptionPreviewIntent = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}) => {
	switch (billingContext.intent) {
		case UpdateSubscriptionIntent.UpdateQuantity:
			return UpdateSubscriptionPreviewIntent.UpdateQuantity;
		case UpdateSubscriptionIntent.UpdatePlan:
			return UpdateSubscriptionPreviewIntent.UpdatePlan;
		case UpdateSubscriptionIntent.CancelAction: {
			switch (billingContext.cancelAction) {
				case "cancel_immediately":
					return UpdateSubscriptionPreviewIntent.CancelImmediately;
				case "cancel_end_of_cycle":
					return UpdateSubscriptionPreviewIntent.CancelEndOfCycle;
				case "uncancel":
					return UpdateSubscriptionPreviewIntent.Uncancel;
				default:
					return UpdateSubscriptionPreviewIntent.None;
			}
		}

		case UpdateSubscriptionIntent.None:
			return UpdateSubscriptionPreviewIntent.None;
	}
};
