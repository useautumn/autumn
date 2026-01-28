import { AttachParamsV0Schema, InternalError } from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { billingResultToResponse } from "../utils/billingResult/billingResultToResponse";

export const handleAttachV2 = createRoute({
	body: AttachParamsV0Schema,
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

		const { billingContext, billingResult } = await billingActions.attach({
			ctx,
			params: body,
			preview: true,
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
