import {
	filterCustomerProductsByActiveStatuses,
	filterCustomerProductsByStripeSubscriptionId,
} from "@autumn/shared";
import { customerProductToStripeItemSpecs } from "@server/internal/billing/v2/providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs";
import type { StripeItemSpec } from "@shared/models/billingModels/stripeAdapterModels/stripeItemSpec";
import type { FullCusProduct } from "@shared/models/cusProductModels/cusProductModels";
import type Stripe from "stripe";
import { stripeSubscriptionItemToStripePriceId } from "@/external/stripe/subscriptions/subscriptionItems/utils/convertStripeSubscriptionItemUtils";
import { findStripeSubscriptionItemByStripePriceId } from "@/external/stripe/subscriptions/subscriptionItems/utils/findStripeSubscriptionItemUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { findStripeItemSpecByStripePriceId } from "./findStripeItemSpec";

/**
 * Convert customer products to recurring stripe item specs
 * @param ctx - The context
 * @param billingContext - The billing context
 * @param customerProducts - The customer products
 * @returns The recurring stripe item specs
 */
const customerProductsToRecurringStripeItemSpecs = ({
	ctx,
	billingContext,
	customerProducts,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
}): StripeItemSpec[] => {
	const stripeItemSpecs: StripeItemSpec[] = [];

	for (const customerProduct of customerProducts) {
		const { recurringItems } = customerProductToStripeItemSpecs({
			ctx,
			billingContext,
			customerProduct,
		});

		for (const recurringItem of recurringItems) {
			// 1. If price ID is already in the array, update the quantity
			const existingItem = stripeItemSpecs.find(
				(item) => item.stripePriceId === recurringItem.stripePriceId,
			);

			if (existingItem) {
				existingItem.quantity =
					(existingItem.quantity ?? 0) + (recurringItem.quantity ?? 0);
			} else {
				stripeItemSpecs.push(recurringItem);
			}
		}
	}

	return stripeItemSpecs;
};

/**
 * Convert stripe item specs to stripe subscription update params items
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
		const shouldCreateItem = !existingItem && !shouldUpdateItem;

		if (shouldUpdateItem) {
			subItemsUpdate.push({
				id: existingItem.id,
				quantity: stripeItemSpec.quantity,
			});
		}
		if (shouldCreateItem) {
			subItemsUpdate.push({
				price: stripeItemSpec.stripePriceId,
				quantity: stripeItemSpec.quantity,
			});
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
}) => {
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
	const recurringItems = customerProductsToRecurringStripeItemSpecs({
		ctx,
		billingContext,
		customerProducts: activeCustomerProducts,
	});

	// 4. Diff it with the current subscription items
	return stripeItemSpecsToSubItemsUpdate({
		billingContext,
		stripeItemSpecs: recurringItems,
	});
};
