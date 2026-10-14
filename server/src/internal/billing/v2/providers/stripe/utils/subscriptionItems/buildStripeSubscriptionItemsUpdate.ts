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
import { findMatchingInlineSubscriptionItem } from "@/internal/billing/v2/providers/stripe/utils/matchUtils/matchStripeInlinePrice";
import { customerProductsToRecurringStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/customerProductsToRecurringStripeItemSpecs";
import { stripeItemSpecToSubscriptionItem } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/stripeItemSpecToStripeParam";
import { getInsertedOrPatchedCustomerProductIds } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { findStripeItemSpecByStripePriceId } from "./findStripeItemSpec";

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
	const matchedSubscriptionItemIds = new Set<string>();

	for (const spec of stripeItemSpecs) {
		if (spec.stripeInlinePrice) {
			/** Reuse unchanged inline items; replacing them can reset Stripe's item period state. */
			const existingItem = findMatchingInlineSubscriptionItem({
				inlinePrice: spec.stripeInlinePrice,
				metadata: spec.metadata,
				subscriptionItems: currentSubscriptionItems,
				usedSubscriptionItemIds: matchedSubscriptionItemIds,
			});

			if (existingItem) {
				matchedSubscriptionItemIds.add(existingItem.id);
				if (existingItem.quantity !== spec.quantity) {
					subItemsUpdate.push({
						id: existingItem.id,
						...(spec.quantity !== undefined && { quantity: spec.quantity }),
						...(spec.metadata && { metadata: spec.metadata }),
					});
				}
			} else {
				subItemsUpdate.push(stripeItemSpecToSubscriptionItem({ spec }));
			}
			continue;
		}

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

	for (const subItem of currentSubscriptionItems) {
		if (matchedSubscriptionItemIds.has(subItem.id)) {
			continue;
		}

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
	const relatedCustomerProducts = filterCustomerProductsByStripeSubscriptionId({
		customerProducts: finalCustomerProducts,
		stripeSubscriptionId: billingContext.stripeSubscription?.id,
	});

	const stripeManagedCustomerProducts = filterCustomerProductsByProcessorType({
		customerProducts: relatedCustomerProducts,
		processorType: ProcessorType.Stripe,
	});

	const mutatedCustomerProductIds = new Set([
		...getInsertedOrPatchedCustomerProductIds({ autumnBillingPlan }),
		...(autumnBillingPlan.customerLicenseTransitions ?? []).map(
			(transition) =>
				transition.incomingCustomerLicense.parent_customer_product_id,
		),
	]);
	const nonOrphanCustomerProducts = stripeManagedCustomerProducts.filter(
		(customerProduct) => {
			if (mutatedCustomerProductIds.has(customerProduct.id)) return true;
			const isPaidRecurringOrphan =
				cp(customerProduct).paid().recurring().valid &&
				!cp(customerProduct).hasSubscription().valid;
			return !isPaidRecurringOrphan;
		},
	);

	const activeCustomerProducts = filterCustomerProductsByActiveStatuses({
		customerProducts: nonOrphanCustomerProducts,
	});

	const recurringStripeItemSpecs = customerProductsToRecurringStripeItemSpecs({
		ctx,
		billingContext,
		customerProducts: activeCustomerProducts,
	});

	return stripeItemSpecsToSubItemsUpdate({
		billingContext,
		stripeItemSpecs: recurringStripeItemSpecs,
	});
};
