import {
	CusProductStatus,
	CustomerExpand,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusService } from "@/internal/customers/CusService";

/**
 * Internal route for get full customer object
 */
export const handleGetCustomer = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id } = c.req.param();

		const fullCus = await CusService.getFull({
			ctx,
			idOrInternalId: customer_id,
			withEntities: true,
			expand: [CustomerExpand.Invoices],
			inStatuses: [
				CusProductStatus.Active,
				CusProductStatus.PastDue,
				CusProductStatus.Scheduled,
				CusProductStatus.Expired,
			],
		});

		const schedule = await (async () => {
			const [existingSchedule] = await ctx.db
				.select()
				.from(schedules)
				.where(
					eq(schedules.internal_customer_id, fullCus.internal_id),
				)
				.limit(1);

			if (!existingSchedule) return undefined;

			const phases = await ctx.db
				.select()
				.from(schedulePhases)
				.where(eq(schedulePhases.schedule_id, existingSchedule.id));

			return { ...existingSchedule, phases };
		})();

		return c.json({
			customer: { ...fullCus, schedule },
		});
	},
});
