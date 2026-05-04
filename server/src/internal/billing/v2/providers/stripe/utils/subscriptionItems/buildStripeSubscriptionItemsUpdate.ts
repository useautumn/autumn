import type {
	AutumnBillingPlan,
	BillingContext,
	StripeItemSpec,
} from "@autumn/shared";
import {
	cp,
	filterCustomerProductsByActiveStatuses,
	filterCustomerProductsByProcessorType,
	filterCustomerProductsByStripeSubscriptionId,
	ProcessorType,
} from "@autumn/shared";
import type { FullCusProduct } from "@shared/models/cusProductModels/cusProductModels";
import type Stripe from "stripe";
import { stripeSubscriptionItemToStripePriceId } from "@/external/stripe/subscriptions/subscriptionItems/utils/convertStripeSubscriptionItemUtils";
import { findStripeSubscriptionItemByStripePriceId } from "@/external/stripe/subscriptions/subscriptionItems/utils/findStripeSubscriptionItemUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductsToRecurringStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/customerProductsToRecurringStripeItemSpecs";
import { stripeItemSpecToSubscriptionItem } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/stripeItemSpecToStripeParam";
import { findStripeItemSpecByStripePriceId } from "./findStripeItemSpec";

/**
 * Diffs desired stripe item specs against current subscription items.
 * Handles both stored-price and entity-scoped inline-price items.
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

	for (const spec of stripeItemSpecs) {
		// Inline prices are always new items (no existing sub item to match)
		if (spec.stripeInlinePrice) {
			subItemsUpdate.push(stripeItemSpecToSubscriptionItem({ spec }));
			continue;
		}

		// Stored price — check for existing subscription item
		if (!spec.stripePriceId) continue;

		const existingItem = findStripeSubscriptionItemByStripePriceId({
			stripePriceId: spec.stripePriceId,
			stripeSubscriptionItems: currentSubscriptionItems,
		});

		const shouldUpdateItem =
			existingItem && existingItem.quantity !== spec.quantity;
		const shouldCreateItem = !existingItem;

		if (shouldUpdateItem) {
			subItemsUpdate.push({
				id: existingItem.id,
				...(spec.quantity !== undefined && { quantity: spec.quantity }),
				...(spec.metadata && { metadata: spec.metadata }),
			});
		}

		if (shouldCreateItem) {
			subItemsUpdate.push({
				price: spec.stripePriceId,
				...(spec.quantity !== undefined && { quantity: spec.quantity }),
				...(spec.metadata && { metadata: spec.metadata }),
			});
		}
	}

	// Remove subscription items that are no longer in the desired specs
	for (const subItem of currentSubscriptionItems) {
		const matchingSpec = findStripeItemSpecByStripePriceId({
			stripePriceId: stripeSubscriptionItemToStripePriceId(subItem),
			stripeItemSpecs,
		});

		if (!matchingSpec) {
			subItemsUpdate.push({ id: subItem.id, deleted: true });
		}
	}

	return subItemsUpdate;
};

export const buildStripeSubscriptionItemsUpdate = ({
	ctx,
	billingContext,
	autumnBillingPlan,
	finalCustomerProducts,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	finalCustomerProducts: FullCusProduct[];
}): Stripe.SubscriptionUpdateParams.Item[] => {
	// 1. Filter customer products by stripe subscription id
	const relatedCustomerProducts = filterCustomerProductsByStripeSubscriptionId({
		customerProducts: finalCustomerProducts,
		stripeSubscriptionId: billingContext.stripeSubscription?.id,
	});

	// 2. Drop customer products managed by a non-Stripe processor (e.g. RevenueCat).
	//
	// `filterCustomerProductsByStripeSubscriptionId` with `undefined` returns every
	// customer product whose `subscription_ids` is empty — and RC-managed cus products
	// have empty `subscription_ids`. Without this step, an RC product's Stripe price
	// would leak into a brand-new Stripe subscription created for an add-on attach.
	const stripeManagedCustomerProducts = filterCustomerProductsByProcessorType({
		customerProducts: relatedCustomerProducts,
		processorType: ProcessorType.Stripe,
	});

	// 2a. Exclude orphan paid-recurring cusProducts (no sub link, not freshly inserted) — their recurring prices would otherwise leak into a new sub on the next attach.
	const insertedIds = new Set(
		autumnBillingPlan.insertCustomerProducts.map((cp) => cp.id),
	);
	const nonOrphanCustomerProducts = stripeManagedCustomerProducts.filter(
		(customerProduct) => {
			if (insertedIds.has(customerProduct.id)) return true;
			const isPaidRecurringOrphan =
				cp(customerProduct).paid().recurring().valid &&
				!cp(customerProduct).hasSubscription().valid;
			return !isPaidRecurringOrphan;
		},
	);

	// 3. Filter customer products by active statuses
	const activeCustomerProducts = filterCustomerProductsByActiveStatuses({
		customerProducts: nonOrphanCustomerProducts,
	});

	// 4. Get recurring subscription item array (doesn't include one-off items)
	const recurringStripeItemSpecs = customerProductsToRecurringStripeItemSpecs({
		ctx,
		billingContext,
		customerProducts: activeCustomerProducts,
	});

	// 5. Diff against current subscription items
	return stripeItemSpecsToSubItemsUpdate({
		billingContext,
		stripeItemSpecs: recurringStripeItemSpecs,
	});
};
