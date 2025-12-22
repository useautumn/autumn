import type {
	QuantityUpdateDetails,
	StripeSubAction,
} from "@/internal/billing/v2/typesOld";

/**
 * Builds Stripe subscription action from quantity update details.
 *
 * Maps each feature to either an update (if item exists) or create (if new).
 *
 * @param quantityUpdateDetails - Array of quantity update details
 * @param stripeSubscriptionId - Stripe subscription ID to update
 * @returns Stripe subscription action with update items
 */
export const buildStripeSubscriptionAction = ({
	quantityUpdateDetails,
	stripeSubscriptionId,
}: {
	quantityUpdateDetails: QuantityUpdateDetails[];
	stripeSubscriptionId: string;
}): StripeSubAction => {
	return {
		type: "update" as const,
		subId: stripeSubscriptionId,
		items: quantityUpdateDetails.map((detail) => {
			if (detail.existingStripeSubscriptionItem) {
				return {
					id: detail.existingStripeSubscriptionItem.id,
					quantity: detail.updatedFeatureQuantity,
				};
			}

			return {
				price: detail.stripePriceId,
				quantity: detail.updatedFeatureQuantity,
			};
		}),
	};
};
