import { UpdateSubscriptionV0ParamsSchema } from "@autumn/shared";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan";
import { billingPlanToPreviewResponse } from "@/internal/billing/v2/utils/billingPlanToPreviewResponse";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { computeUpdateSubscriptionPlan } from "./compute/computeUpdateSubscriptionPlan";
import { logUpdateSubscriptionContext } from "./logs/logUpdateSubscriptionContext";
import { logUpdateSubscriptionPlan } from "./logs/logUpdateSubscriptionPlan";
import { setupUpdateSubscriptionBillingContext } from "./setup/setupUpdateSubscriptionBillingContext";

export const handlePreviewUpdateSubscription = createRoute({
	body: UpdateSubscriptionV0ParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		ctx.logger.info(
			`=============== RUNNING PREVIEW UPDATE SUBSCRIPTION FOR ${body.customer_id} ===============`,
		);

		const updateSubscriptionBillingContext =
			await setupUpdateSubscriptionBillingContext({
				ctx,
				params: body,
			});
		logUpdateSubscriptionContext({
			ctx,
			billingContext: updateSubscriptionBillingContext,
		});

		const autumnBillingPlan = await computeUpdateSubscriptionPlan({
			ctx,
			billingContext: updateSubscriptionBillingContext,
			params: body,
		});
		logUpdateSubscriptionPlan({
			ctx,
			plan: autumnBillingPlan,
			billingContext: updateSubscriptionBillingContext,
		});

		const stripeBillingPlan = await evaluateStripeBillingPlan({
			ctx,
			billingContext: updateSubscriptionBillingContext,
			autumnBillingPlan,
		});
		logStripeBillingPlan({
			ctx,
			stripeBillingPlan,
			billingContext: updateSubscriptionBillingContext,
		});

		const previewResponse = billingPlanToPreviewResponse({
			ctx,
			billingContext: updateSubscriptionBillingContext,
			billingPlan: {
				autumn: autumnBillingPlan,
				stripe: stripeBillingPlan,
			},
		});

		return c.json({
			...previewResponse,
			autumn: autumnBillingPlan,
			stripe: stripeBillingPlan,
		});
	},
});
