import { CusProductStatus, CustomerExpand } from "@autumn/shared";
import { getTestClockFrozenTimeMs } from "@/external/stripe/testClocks/utils/convertStripeTestClock";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusService } from "@/internal/customers/CusService";
import { hydrateCustomerWithSchedules } from "../cusUtils/getFullCustomerSchedule.js";

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
		const [hydratedCustomer, testClockFrozenTimeMs] = await Promise.all([
			hydrateCustomerWithSchedules({ ctx, fullCustomer: fullCus }),
			getTestClockFrozenTimeMs({
				ctx,
				stripeCustomerId: fullCus.processor?.id,
			}),
		]);

		return c.json({
			customer: hydratedCustomer,
			test_clock_frozen_time_ms: testClockFrozenTimeMs,
		});
	},
});
