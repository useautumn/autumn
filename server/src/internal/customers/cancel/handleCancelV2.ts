import type { UpdateSubscriptionV0Params } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult";
import { computeUpdateSubscriptionPlan } from "@/internal/billing/v2/updateSubscription/compute/computeUpdateSubscriptionPlan";
import { handleUpdateSubscriptionErrors } from "@/internal/billing/v2/updateSubscription/errors/handleUpdateSubscriptionErrors";
import { logUpdateSubscriptionContext } from "@/internal/billing/v2/updateSubscription/logs/logUpdateSubscriptionContext";
import { setupUpdateSubscriptionBillingContext } from "@/internal/billing/v2/updateSubscription/setup/setupUpdateSubscriptionBillingContext";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";

export const handleCancelV2 = createRoute({
	// body: CancelBodySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");

		const {
			customer_id,
			product_id,
			entity_id,
			cancel_immediately = false,
			prorate: bodyProrate = true,
		} = await c.req.json();

		const updateSubscriptionBody: UpdateSubscriptionV0Params = {
			customer_id,
			product_id,
			entity_id,
			cancel_action: cancel_immediately
				? "cancel_immediately"
				: "cancel_end_of_cycle",
			billing_behavior: bodyProrate ? "prorate_immediately" : "next_cycle_only",
		};

		ctx.logger.info(
			`=============== RUNNING CANCEL FOR ${customer_id} ===============`,
		);

		const billingContext = await setupUpdateSubscriptionBillingContext({
			ctx,
			params: updateSubscriptionBody,
		});
		logUpdateSubscriptionContext({ ctx, billingContext });

		const autumnBillingPlan = await computeUpdateSubscriptionPlan({
			ctx,
			billingContext,
			params: updateSubscriptionBody,
		});
		logAutumnBillingPlan({ ctx, plan: autumnBillingPlan, billingContext });

		await handleUpdateSubscriptionErrors({
			ctx,
			billingContext,
			autumnBillingPlan,
			params: updateSubscriptionBody,
		});

		const stripeBillingPlan = await evaluateStripeBillingPlan({
			ctx,
			billingContext,
			autumnBillingPlan,
		});
		logStripeBillingPlan({ ctx, stripeBillingPlan, billingContext });

		const billingResult = await executeBillingPlan({
			ctx,
			billingContext,
			billingPlan: {
				autumn: autumnBillingPlan,
				stripe: stripeBillingPlan,
			},
		});

		logStripeBillingResult({ ctx, result: billingResult.stripe });

		return c.json({
			success: true,
			customer_id: customer_id,
			product_id: product_id,
		});
	},
});
