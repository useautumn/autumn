import type {
	QuantityUpdateDetails,
	StripeSubAction,
} from "@/internal/billing/v2/typesOld";

/**
 * Builds Stripe subscription action from quantity update details.
 *
 * Maps each feature to either an update (if item exists) or create (if new).
 * When updating existing items, applies the quantity difference rather than
 * setting the absolute value, since a customer may have multiple customer
 * products contributing to the same subscription item.
 *
 * @param quantityUpdateDetails - Array of quantity update details
 * @param stripeSubscriptionId - Stripe subscription ID to update
 * @returns Stripe subscription action with update items
 */
export const buildStripeQuantityUpdateAction = ({
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
				const currentSubscriptionItemQuantity =
					detail.existingStripeSubscriptionItem.quantity ?? 0;
				const newSubscriptionItemQuantity =
					currentSubscriptionItemQuantity +
					detail.stripeSubscriptionItemQuantityDifference;

				return {
					id: detail.existingStripeSubscriptionItem.id,
					quantity: newSubscriptionItemQuantity,
				};
			}

			return {
				price: detail.stripePriceId,
				quantity: detail.updatedFeatureQuantity,
			};
		}),
	};
};
