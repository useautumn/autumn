import type { StripeItemSpec } from "@shared/models/billingModels/stripeAdapterModels/stripeItemSpec";
import type { FullCusProduct } from "@shared/models/cusProductModels/cusProductModels";
import { isCustomerProductOnStripeSubscription } from "@shared/utils";
import type Stripe from "stripe";
import { stripeSubscriptionItemToStripePriceId } from "@/external/stripe/subscriptions/subscriptionItems/utils/convertStripeSubscriptionItemUtils";
import { findStripeSubscriptionItemByStripePriceId } from "@/external/stripe/subscriptions/subscriptionItems/utils/findStripeSubscriptionItemUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { findStripeItemSpecByStripePriceId } from "@/internal/billing/v2/utils/stripeAdapter/stripeItemSpec/findStripeItemSpecUtils";
import { customerProductToStripeItemSpecs } from "@/internal/billing/v2/utils/stripeAdapter/subscriptionItems/customerProductToStripeItemSpecs";

const getFinalCustomerProductsState = ({
	billingContext,
	addCustomerProducts = [],
	removeCustomerProducts = [],
}: {
	billingContext: BillingContext;
	addCustomerProducts?: FullCusProduct[];
	removeCustomerProducts?: FullCusProduct[];
}) => {
	const { fullCustomer, stripeSubscription } = billingContext;

	let customerProducts = stripeSubscription
		? fullCustomer.customer_products.filter((cp) =>
				isCustomerProductOnStripeSubscription({
					customerProduct: cp,
					stripeSubscriptionId: stripeSubscription.id,
				}),
			)
		: [];

	customerProducts = customerProducts.filter(
		(cp) =>
			!removeCustomerProducts.some((cpToRemove) => cpToRemove.id === cp.id),
	);

	customerProducts = [...customerProducts, ...addCustomerProducts];

	return customerProducts;
};

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
	addCustomerProducts = [],
	removeCustomerProducts = [],
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	addCustomerProducts?: FullCusProduct[];
	removeCustomerProducts?: FullCusProduct[];
}) => {
	// 1. Get final customer product state
	const customerProducts = getFinalCustomerProductsState({
		billingContext,
		addCustomerProducts,
		removeCustomerProducts,
	});

	// 2. Get recurring subscription item array (doesn't include one off items)
	const recurringItems = customerProductsToRecurringStripeItemSpecs({
		ctx,
		billingContext,
		customerProducts,
	});

	// 3. Diff it with the current subscription items
	return stripeItemSpecsToSubItemsUpdate({
		billingContext,
		stripeItemSpecs: recurringItems,
	});
};
