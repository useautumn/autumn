import {
	CustomerRefundParamsSchema,
	CustomerRefundPreviewResponseSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { buildRefundPreview } from "../../refunds/customerRefundUtils.js";

export const handleRefundPreview = createRoute({
	params: z.object({
		customer_id: z.string(),
	}),
	body: CustomerRefundParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id: customerId } = c.req.param();
		const body = c.req.valid("json");
		const response = await buildRefundPreview({
			ctx,
			customerId,
			chargeIds: body.charge_ids,
			mode: body.mode,
			amountsByChargeId: body.amounts_by_charge_id,
			reason: body.reason,
		});
		return c.json(CustomerRefundPreviewResponseSchema.parse(response), 200);
	},
});
