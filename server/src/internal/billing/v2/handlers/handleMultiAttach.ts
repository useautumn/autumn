import {
	AffectedResource,
	InternalError,
	MultiAttachParamsV0Schema,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { billingResultToResponse } from "../utils/billingResult/billingResultToResponse";

export const handleMultiAttach = createRoute({
	versionedBody: {
		latest: MultiAttachParamsV0Schema,
	},
	resource: AffectedResource.MultiAttach,
	lock:
		process.env.NODE_ENV !== "development"
			? {
					ttlMs: 120000,
					errorMessage:
						"Multi-attach already in progress for this customer, try again in a few seconds",
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

		const { billingContext, billingResult } = await billingActions.multiAttach({
			ctx,
			params: body,
		});

		if (!billingResult) {
			throw new InternalError({
				message: "billingResult not returned from multiAttach action",
			});
		}

		const response = billingResultToResponse({
			billingContext,
			billingResult,
		});

		return c.json(response, 200);
	},
});
