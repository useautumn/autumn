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
	autumnBillingPlan: AutumnBillingPlan;
	stripeBillingPlan: StripeBillingPlan;
	planIds: string[];
};

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
			refundLastPayment: groupContexts.find(
				(context) => context.refundLastPayment !== undefined,
			)?.refundLastPayment,
			subscriptionParams: groupContexts.find(
				(context) => context.subscriptionParams !== undefined,
			)?.subscriptionParams,
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
