import { CustomerNotFoundError } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "../CusService.js";
import {
	getFullCustomerSchedule,
	getAllCustomerSchedules,
} from "../cusUtils/getFullCustomerSchedule.js";

/**
 * Internal route for fetching a customer's persisted schedule(s).
 *
 * Returns the customer-level schedule (no entity) plus any entity schedules
 * keyed by `internal_entity_id`. This exists as a dedicated endpoint so that
 * the base customer fetch can skip the extra `schedules` + `schedulePhases`
 * lookup on every request.
 */
export const handleGetCustomerSchedule = createRoute({
	params: z.object({ customer_id: z.string() }),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id } = c.req.param();

		const customer = await CusService.get({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: customer_id,
		});

		if (!customer) {
			throw new CustomerNotFoundError({ customerId: customer_id });
		}

		const [customerSchedule, allSchedules] = await Promise.all([
			getFullCustomerSchedule({
				ctx,
				internalCustomerId: customer.internal_id,
			}),
			getAllCustomerSchedules({
				ctx,
				internalCustomerId: customer.internal_id,
			}),
		]);

		const entitySchedules: Record<string, (typeof allSchedules)[number]> = {};
		for (const schedule of allSchedules) {
			if (schedule.internal_entity_id) {
				entitySchedules[schedule.internal_entity_id] = schedule;
			}
		}

		return c.json({
			schedule: customerSchedule ?? null,
			entity_schedules: entitySchedules,
		});
	},
});
