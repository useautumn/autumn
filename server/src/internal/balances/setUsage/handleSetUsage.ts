import { ACTIVE_STATUSES, SetUsageParamsSchema } from "@autumn/shared";
import { CusService } from "@/internal/customers/CusService.js";
import { createRoute } from "../../../honoMiddlewares/routeHandler.js";
import { executePostgresDeduction } from "../utils/deduction/executePostgresDeduction.js";
import { getSetUsageDeductions } from "./getSetUsageDeductions.js";

export const handleSetUsage = createRoute({
	body: SetUsageParamsSchema,
	handler: async (c) => {
		// 1. Get feature deductions
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const fullCustomer = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: body.customer_id,
			entityId: body.entity_id,
			orgId: ctx.org.id,
			env: ctx.env,
			inStatuses: ACTIVE_STATUSES,
		});

		// Build feature deductions
		const featureDeductions = await getSetUsageDeductions({
			ctx,
			setUsageParams: body,
			fullCustomer,
		});

		await executePostgresDeduction({
			ctx,
			fullCustomer,
			customerId: body.customer_id,
			deductions: featureDeductions,
			refreshCache: true,
		});

		return c.json({ success: true });
	},
});
