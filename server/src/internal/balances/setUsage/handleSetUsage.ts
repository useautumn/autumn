import { SetUsageParamsSchema } from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler.js";
import { runDeductionTx } from "../track/trackUtils/runDeductionTx.js";
import { getSetUsageDeductions } from "./getSetUsageDeductions.js";

export const handleSetUsage = createRoute({
	body: SetUsageParamsSchema,
	handler: async (c) => {
		// 1. Get feature deductions
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		// Build feature deductions
		const featureDeductions = await getSetUsageDeductions({
			ctx,
			setUsageParams: body,
		});

		const start = Date.now();
		await runDeductionTx({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
			deductions: featureDeductions,

			refreshCache: true,
		});

		const elapsed = Date.now() - start;
		ctx.logger.info(`[handleTrack] runDeductionTx ms: ${elapsed}`);

		return c.json({ success: true });
	},
});
