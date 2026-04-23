import { CusProductStatus, CustomerExpand } from "@autumn/shared";
import { getTestClockFrozenTimeMs } from "@/external/stripe/testClocks/utils/convertStripeTestClock";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusService } from "@/internal/customers/CusService";

/**
 * Internal route for get full customer object.
 *
 * Note: schedules are NOT hydrated here. Dashboard consumers that need the
 * customer's persisted schedule must fetch it separately via
 * `GET /customers/:customer_id/schedule`.
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

		const testClockFrozenTimeMs = await getTestClockFrozenTimeMs({
			ctx,
			stripeCustomerId: fullCus.processor?.id,
		});

		return c.json({
			customer: fullCus,
			test_clock_frozen_time_ms: testClockFrozenTimeMs,
		});
	},
});
