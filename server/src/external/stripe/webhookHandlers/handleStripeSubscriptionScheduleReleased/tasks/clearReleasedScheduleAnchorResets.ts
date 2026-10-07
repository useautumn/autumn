import { filterCustomerProductsByStripeSubscriptionId } from "@autumn/shared";
import { isAutumnOriginatedStripeEvent } from "@/external/stripe/common/autumnStripeIdempotency";
import { getExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import { stripeSubscriptionToNowMs } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";
import { isAutumnManagedStripeSchedule } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";
import { createAutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext.js";
import { isOrphanedBillingCycleAnchorReset } from "../../common/billingCycleAnchorReset/isOrphanedBillingCycleAnchorReset";
import { planOrphanedBillingCycleAnchorReset } from "../../common/billingCycleAnchorReset/planOrphanedBillingCycleAnchorReset";
import type { StripeScheduleReleasedContext } from "../stripeScheduleReleasedContext.js";

/** A released schedule takes its pending anchor resets with it, so Autumn drops them too. */
export const clearReleasedScheduleAnchorResets = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeScheduleReleasedContext;
}) => {
	const { fullCustomer } = ctx;
	const { schedule } = eventContext;
	const stripeSubscriptionId = schedule.released_subscription;
	if (isAutumnManagedStripeSchedule({ schedule })) return;
	// Autumn releases a schedule only to rebuild it in the same action, which plans its own resets.
	if (isAutumnOriginatedStripeEvent({ event: ctx.stripeEvent })) return;
	if (!fullCustomer || !stripeSubscriptionId) return;

	const stripeSubscription = await getExpandedStripeSubscription({
		ctx,
		subscriptionId: stripeSubscriptionId,
	});
	const nowMs = await stripeSubscriptionToNowMs({
		stripeSubscription,
		stripeCli: ctx.stripeCli,
	});
	const orphanedCustomerProducts = filterCustomerProductsByStripeSubscriptionId(
		{
			customerProducts: fullCustomer.customer_products,
			stripeSubscriptionId,
		},
	).filter((customerProduct) =>
		isOrphanedBillingCycleAnchorReset({
			customerProduct,
			stripeSubscription,
			nowMs,
		}),
	);
	if (orphanedCustomerProducts.length === 0) return;

	const plan = createAutumnBillingPlanBuilder({
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
	});
	for (const customerProduct of orphanedCustomerProducts) {
		planOrphanedBillingCycleAnchorReset({ customerProduct, nowMs, plan });
	}
	await executeAutumnBillingPlan({ ctx, autumnBillingPlan: plan.build() });
	eventContext.results.clearedAnchorResets = orphanedCustomerProducts.length;
};
