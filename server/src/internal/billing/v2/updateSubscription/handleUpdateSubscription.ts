import { UpdateSubscriptionV0ParamsSchema } from "@autumn/shared";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult";
import { computeUpdateSubscriptionPlan } from "@/internal/billing/v2/updateSubscription/compute/computeUpdateSubscriptionPlan";
import { handleUpdateSubscriptionErrors } from "@/internal/billing/v2/updateSubscription/errors/handleUpdateSubscriptionErrors";
import { logUpdateSubscriptionContext } from "@/internal/billing/v2/updateSubscription/logs/logUpdateSubscriptionContext";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { executeBillingPlan } from "../execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "../providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { setupUpdateSubscriptionBillingContext } from "./setup/setupUpdateSubscriptionBillingContext";

export const handleUpdateSubscription = createRoute({
	body: UpdateSubscriptionV0ParamsSchema,
	lock:
		process.env.NODE_ENV !== "development"
			? {
					ttlMs: 120000,
					errorMessage:
						"Update subscription already in progress for this customer, try again in a few seconds",
					getKey: (c) => {
						const ctx = c.get("ctx");
						const attachBody = c.req.valid("json");
						return `lock:attach:${ctx.org.id}:${ctx.env}:${attachBody.customer_id}`;
					},
				}
			: undefined,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		ctx.logger.info(
			`=============== RUNNING UPDATE SUBSCRIPTION FOR ${body.customer_id} ===============`,
		);

		const billingContext = await setupUpdateSubscriptionBillingContext({
			ctx,
			params: body,
		});
		logUpdateSubscriptionContext({ ctx, billingContext });

		const autumnBillingPlan = await computeUpdateSubscriptionPlan({
			ctx,
			billingContext,
			params: body,
		});
		logAutumnBillingPlan({ ctx, plan: autumnBillingPlan, billingContext });

		await handleUpdateSubscriptionErrors({
			ctx,
			billingContext,
			autumnBillingPlan,
			params: body,
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

		const response = billingResultToResponse({
			billingContext,
			billingResult,
		});

		return c.json(response, 200);
	},
});
