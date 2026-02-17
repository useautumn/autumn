import {
	AffectedResource,
	ApiVersion,
	AttachParamsV0Schema,
	AttachParamsV1Schema,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { billingPlanToChanges } from "@/internal/billing/v2/utils/billingPlanToChanges.js";
import { billingPlanToPreviewResponse } from "@/internal/billing/v2/utils/billingPlanToPreviewResponse";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handlePreviewAttach = createRoute({
	versionedBody: {
		latest: AttachParamsV1Schema,
		[ApiVersion.V1_Beta]: AttachParamsV0Schema,
	},
	resource: AffectedResource.Attach,
	lock:
		process.env.NODE_ENV !== "development"
			? {
					ttlMs: 120000,
					errorMessage:
						"Attach already in progress for this customer, try again in a few seconds",
					getKey: (c) => {
						const ctx = c.get("ctx");
						const body = c.req.valid("json");
						return `lock:attach:${ctx.org.id}:${ctx.env}:${body.customer_id}`;
					},
				}
			: undefined,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const { billingContext, billingPlan } = await billingActions.attach({
			ctx,
			params: body,
			preview: true,
		});

		// billingPlan is always present when preview: true
		if (!billingPlan) {
			throw new Error("Billing plan not found for preview");
		}

		// 7. Format response
		const previewResponse = billingPlanToPreviewResponse({
			ctx,
			billingContext,
			billingPlan,
		});

		// 8. Build incoming/outgoing changes
		const { incoming, outgoing } = await billingPlanToChanges({
			ctx,
			billingContext,
			billingPlan,
		});

		return c.json(
			{
				...previewResponse,
				incoming,
				outgoing,
			},
			200,
		);
	},
});
