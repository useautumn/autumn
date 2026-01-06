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

const customerProductsToRecurringStripeItemSpecs = ({
	ctx,
	billingContext,
	customerProducts,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
}) => {
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

const stripeItemSpecsToSubItemsUpdate = ({
	billingContext,
	stripeItemSpecs,
}: {
	billingContext: BillingContext;
	stripeItemSpecs: StripeItemSpec[];
}) => {
	const { stripeSubscription } = billingContext;
	const currentSubscriptionItems = stripeSubscription?.items.data ?? [];

	const subItemsUpdate: Stripe.SubscriptionUpdateParams.Item[] = [];
	for (const stripeItemSpec of stripeItemSpecs) {
		const existingItem = findStripeSubscriptionItemByStripePriceId({
			stripePriceId: stripeItemSpec.stripePriceId,
			stripeSubscriptionItems: currentSubscriptionItems,
		});

		if (existingItem && existingItem.quantity !== stripeItemSpec.quantity) {
			subItemsUpdate.push({
				id: existingItem.id,
				quantity: stripeItemSpec.quantity,
			});
		} else if (!existingItem) {
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
		if (!stripeItemSpec) {
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
	let customerProducts = filterCustomerProductsByStripeSubscriptionId({
		customerProducts: finalCustomerProducts,
		stripeSubscriptionId: billingContext.stripeSubscription?.id,
	});

	// 2. Filter customer products by active statuses
	customerProducts = filterCustomerProductsByActiveStatuses({
		customerProducts,
	});

	// 3. Get recurring subscription item array (doesn't include one off items)
	const recurringItems = customerProductsToRecurringStripeItemSpecs({
		ctx,
		billingContext,
		customerProducts,
	});

	// 4. Diff it with the current subscription items
	return stripeItemSpecsToSubItemsUpdate({
		billingContext,
		stripeItemSpecs: recurringItems,
	});
};
