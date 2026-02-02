import type { BillingContext, StripeItemSpec } from "@autumn/shared";
import {
	filterCustomerProductsByActiveStatuses,
	filterCustomerProductsByStripeSubscriptionId,
} from "@autumn/shared";
import type { FullCusProduct } from "@shared/models/cusProductModels/cusProductModels";
import type Stripe from "stripe";
import { stripeSubscriptionItemToStripePriceId } from "@/external/stripe/subscriptions/subscriptionItems/utils/convertStripeSubscriptionItemUtils";
import { findStripeSubscriptionItemByStripePriceId } from "@/external/stripe/subscriptions/subscriptionItems/utils/findStripeSubscriptionItemUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductsToRecurringStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/customerProductsToRecurringStripeItemSpecs";
import { findStripeItemSpecByStripePriceId } from "./findStripeItemSpec";

/**
 * Convert stripe item specs to stripe subscription update params items.
 * For metered prices (quantity undefined), we don't include quantity as Stripe requires.
 * @param billingContext - The billing context
 * @param stripeItemSpecs - The stripe item specs
 * @returns The subscription item update params
 */
const stripeItemSpecsToSubItemsUpdate = ({
	billingContext,
	stripeItemSpecs,
}: {
	billingContext: BillingContext;
	stripeItemSpecs: StripeItemSpec[];
}): Stripe.SubscriptionUpdateParams.Item[] => {
	const { stripeSubscription } = billingContext;
	const currentSubscriptionItems = stripeSubscription?.items.data ?? [];

	const subItemsUpdate: Stripe.SubscriptionUpdateParams.Item[] = [];
	for (const stripeItemSpec of stripeItemSpecs) {
		const existingItem = findStripeSubscriptionItemByStripePriceId({
			stripePriceId: stripeItemSpec.stripePriceId,
			stripeSubscriptionItems: currentSubscriptionItems,
		});

		const shouldUpdateItem =
			existingItem && existingItem.quantity !== stripeItemSpec.quantity;
		const shouldCreateItem = !existingItem;

		if (shouldUpdateItem) {
			// For metered prices, don't include quantity
			if (stripeItemSpec.quantity === undefined) {
				subItemsUpdate.push({ id: existingItem.id });
			} else {
				subItemsUpdate.push({
					id: existingItem.id,
					quantity: stripeItemSpec.quantity,
				});
			}
		}
		if (shouldCreateItem) {
			// For metered prices, don't include quantity
			if (stripeItemSpec.quantity === undefined) {
				subItemsUpdate.push({ price: stripeItemSpec.stripePriceId });
			} else {
				subItemsUpdate.push({
					price: stripeItemSpec.stripePriceId,
					quantity: stripeItemSpec.quantity,
				});
			}
		}
	}

	for (const subItem of currentSubscriptionItems) {
		const stripeItemSpec = findStripeItemSpecByStripePriceId({
			stripePriceId: stripeSubscriptionItemToStripePriceId(subItem),
			stripeItemSpecs,
		});

		const shouldRemoveItem = !stripeItemSpec;
		if (shouldRemoveItem) {
			subItemsUpdate.push({ id: subItem.id, deleted: true });
		}
	}

	return subItemsUpdate;
};

export const buildStripeSubscriptionItemsUpdate = ({
	ctx,
	billingContext,
	finalCustomerProducts,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	finalCustomerProducts: FullCusProduct[];
}): Stripe.SubscriptionUpdateParams.Item[] => {
	// 1. Filter customer products by stripe subscription id
	const relatedCustomerProducts = filterCustomerProductsByStripeSubscriptionId({
		customerProducts: finalCustomerProducts,
		stripeSubscriptionId: billingContext.stripeSubscription?.id,
	});

	// 2. Filter customer products by active statuses
	const activeCustomerProducts = filterCustomerProductsByActiveStatuses({
		customerProducts: relatedCustomerProducts,
	});

	// 3. Get recurring subscription item array (doesn't include one off items)
	const recurringStripeItemSpecs = customerProductsToRecurringStripeItemSpecs({
		ctx,
		billingContext,
		customerProducts: activeCustomerProducts,
	});

	// 5. Diff it with the current subscription items
	return stripeItemSpecsToSubItemsUpdate({
		billingContext,
		stripeItemSpecs: recurringStripeItemSpecs,
	});
};
