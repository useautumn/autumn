import {
	AffectedResource,
	ApiVersion,
	InternalError,
	UpdateSubscriptionV0ParamsSchema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { billingResultToResponse } from "../utils/billingResult/billingResultToResponse";

export const handleUpdateSubscription = createRoute({
	versionedBody: {
		latest: UpdateSubscriptionV1ParamsSchema,
		[ApiVersion.V1_Beta]: UpdateSubscriptionV0ParamsSchema,
	},
	resource: AffectedResource.ApiSubscriptionUpdate,
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

		const { billingContext, billingResult } =
			await billingActions.updateSubscription({
				ctx,
				params: body,
				preview: false,
			});

		if (!billingResult) {
			throw new InternalError({
				message: "billingResult not returned from updateSubscription action",
			});
		}

		// 7. Format response
		const response = billingResultToResponse({
			billingContext,
			billingResult,
		});

		return c.json(response, 200);
	},
});
