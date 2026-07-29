import type {
	AutumnBillingPlan,
	FullCustomer,
	StripeBillingPlan,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { fetchStoredLineItemsForSubscriptionBilling } from "@/internal/billing/v2/setup/fetchStoredLineItemsForSubscriptionBilling";
import { mergeAutumnBillingPlans } from "@/internal/billing/v2/utils/billingPlan/mergeAutumnBillingPlans";
import type { MultiUpdateItemResult } from "../compute/computeMultiUpdateFold";

export type MultiUpdateStripeBillingPlan = {
	subscriptionId: string;
	billingContext: UpdateSubscriptionBillingContext;
	/** This subscription's items' plans merged — NOT the full request plan. */
	autumnBillingPlan: AutumnBillingPlan;
	stripeBillingPlan: StripeBillingPlan;
	/** The plans updated on this subscription (unique product ids). */
	planIds: string[];
};

/**
 * Evaluate once per distinct Stripe subscription, each against a plan merged
 * from ONLY that subscription's items. Manual invoices are subscription-linked
 * in Stripe, so scoping the plan per sub yields one credit invoice per sub
 * carrying only its own line items. Items without a subscription (free
 * products) contribute Autumn-only changes and are skipped here.
 *
 * The evaluation context is the first item's context on each subscription with
 * fullCustomer reset to the ORIGINAL customer — the sub plan already carries
 * its items' changes, so applying it to a projected customer would double-apply.
 */
export const evaluateMultiUpdateStripe = async ({
	ctx,
	fullCustomer,
	itemResults,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	itemResults: MultiUpdateItemResult[];
}): Promise<MultiUpdateStripeBillingPlan[]> => {
	const itemsBySubscriptionId = new Map<string, MultiUpdateItemResult[]>();
	for (const itemResult of itemResults) {
		const subscriptionId = itemResult.billingContext.stripeSubscription?.id;
		if (!subscriptionId || itemResult.billingContext.skipBillingChanges) {
			continue;
		}

		const group = itemsBySubscriptionId.get(subscriptionId) ?? [];
		group.push(itemResult);
		itemsBySubscriptionId.set(subscriptionId, group);
	}

	const stripeBillingPlans: MultiUpdateStripeBillingPlan[] = [];
	for (const [subscriptionId, groupItems] of itemsBySubscriptionId) {
		const subscriptionPlan = groupItems.reduce<AutumnBillingPlan>(
			(plan, itemResult) =>
				mergeAutumnBillingPlans({ base: plan, incoming: itemResult.itemPlan }),
			{
				customerId: fullCustomer.id ?? fullCustomer.internal_id,
				insertCustomerProducts: [],
			},
		);

		const groupContexts = groupItems.map((item) => item.billingContext);
		const { storedChargeLineItems, storedRefundLineItems } =
			await fetchStoredLineItemsForSubscriptionBilling({
				db: ctx.db,
				fullCustomer,
				stripeSubscription: groupContexts[0].stripeSubscription,
				outgoingCusProductIds: groupContexts.map(
					(context) => context.customerProduct.id,
				),
			});

		// The sub's invoice is upserted with the context's fullProducts; scope it
		// to this group's products so invoice product_ids reflect this sub only.
		const fullProductById = new Map(
			groupContexts
				.flatMap((context) => context.fullProducts)
				.map((fullProduct) => [
					fullProduct.internal_id ?? fullProduct.id,
					fullProduct,
				]),
		);

		const evaluationContext: UpdateSubscriptionBillingContext = {
			...groupContexts[0],
			fullCustomer,
			fullProducts: Array.from(fullProductById.values()),
			storedChargeLineItems,
			storedRefundLineItems,
		};

		const stripeBillingPlan = await evaluateStripeBillingPlan({
			ctx,
			billingContext: evaluationContext,
			autumnBillingPlan: subscriptionPlan,
		});

		stripeBillingPlans.push({
			subscriptionId,
			billingContext: evaluationContext,
			autumnBillingPlan: subscriptionPlan,
			stripeBillingPlan,
			planIds: Array.from(
				new Set(
					groupContexts.map((context) => context.customerProduct.product.id),
				),
			),
		});
	}

	return stripeBillingPlans;
};
