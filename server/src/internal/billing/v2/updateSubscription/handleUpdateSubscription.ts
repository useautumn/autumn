import { UpdateSubscriptionV0ParamsSchema } from "@autumn/shared";
import { computeUpdateSubscriptionPlan } from "@/internal/billing/v2/updateSubscription/compute/computeUpdateSubscriptionPlan";
import { handleUpdateSubscriptionErrors } from "@/internal/billing/v2/updateSubscription/errors/handleUpdateSubscriptionErrors";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { executeBillingPlan } from "../execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "../providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { setupUpdateSubscriptionBillingContext } from "./setup/setupUpdateSubscriptionBillingContext";

export const handleUpdateSubscription = createRoute({
	body: UpdateSubscriptionV0ParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		ctx.logger.info(`===============================================`);
		ctx.logger.info(`UPDATE SUBSCRIPTION RUNNING FOR ${body.customer_id}`);

		const billingContext = await setupUpdateSubscriptionBillingContext({
			ctx,
			params: body,
		});

		const autumnBillingPlan = await computeUpdateSubscriptionPlan({
			ctx,
			billingContext,
			params: body,
		});

		await handleUpdateSubscriptionErrors({
			ctx,
			billingContext,
			autumnBillingPlan,
		});

		const stripeBillingPlan = await evaluateStripeBillingPlan({
			ctx,
			billingContext,
			autumnBillingPlan,
		});

		await executeBillingPlan({
			ctx,
			billingContext,
			billingPlan: {
				autumn: autumnBillingPlan,
				stripe: stripeBillingPlan,
			},
		});

		return c.json({ success: true }, 200);
	},
});
