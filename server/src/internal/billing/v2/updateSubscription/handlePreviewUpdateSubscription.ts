import { UpdateSubscriptionV0ParamsSchema } from "@autumn/shared";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { billingPlanToPreviewResponse } from "@/internal/billing/v2/utils/billingPlanToPreviewResponse";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { computeUpdateSubscriptionPlan } from "./compute/computeUpdateSubscriptionPlan";
import { fetchUpdateSubscriptionBillingContext } from "./fetch/fetchUpdateSubscriptionBillingContext";

export const handlePreviewUpdateSubscription = createRoute({
	body: UpdateSubscriptionV0ParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const updateSubscriptionBillingContext =
			await fetchUpdateSubscriptionBillingContext({
				ctx,
				params: body,
			});

		const autumnBillingPlan = await computeUpdateSubscriptionPlan({
			ctx,
			billingContext: updateSubscriptionBillingContext,
			params: body,
		});

		const stripeBillingPlan = await evaluateStripeBillingPlan({
			ctx,
			billingContext: updateSubscriptionBillingContext,
			autumnBillingPlan,
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
