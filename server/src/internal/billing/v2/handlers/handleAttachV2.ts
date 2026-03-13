import {
	AffectedResource,
	ApiVersion,
	AttachParamsV0Schema,
	AttachParamsV1Schema,
	InternalError,
} from "@autumn/shared";
import { buildBillingLockKey } from "@/internal/billing/utils/buildBillingLockKey";
import { billingActions } from "@/internal/billing/v2/actions";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { billingResultToResponse } from "../utils/billingResult/billingResultToResponse";

export const handleAttachV2 = createRoute({
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
						return buildBillingLockKey({
							orgId: ctx.org.id,
							env: ctx.env,
							customerId: body.customer_id,
						});
					},
				}
			: undefined,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const { billingContext, billingResult } = await billingActions.attach({
			ctx,
			params: body,
			preview: false,
		});

		if (!billingResult) {
			throw new InternalError({
				message: "billingResult not returned from attach action",
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
