import {
	AdvanceTestClockParamsSchema,
	type AdvanceTestClockResponse,
	CustomerNotFoundError,
	ErrCode,
	RecaseError,
	type RouteScopeRequirement,
	Scopes,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { advanceStripeTestClock } from "@/external/stripe/testClocks/advanceStripeTestClock";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusService } from "@/internal/customers/CusService";

export const createAdvanceTestClockRoute = ({
	scopes,
}: {
	scopes: RouteScopeRequirement;
}) =>
	createRoute({
		scopes,
		body: AdvanceTestClockParamsSchema,
		handler: async (c) => {
			const { db, org, env } = c.get("ctx");
			const { customer_id: customerId, frozen_time: frozenTime } =
				c.req.valid("json");
			const customer = await CusService.get({
				db,
				orgId: org.id,
				env,
				idOrInternalId: customerId,
			});
			if (!customer) throw new CustomerNotFoundError({ customerId });
			if (!customer.processor?.id) {
				throw new RecaseError({
					message: "Customer does not have a Stripe customer",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			const clock = await advanceStripeTestClock({
				stripe: createStripeCli({ org, env }),
				stripeCustomerId: customer.processor.id,
				frozenTime,
			});
			return c.json({
				customer_id: customer.id ?? customerId,
				frozen_time: clock.frozen_time * 1000,
				status: clock.status,
			} satisfies AdvanceTestClockResponse);
		},
	});

export const handleAdvanceTestClock = createAdvanceTestClockRoute({
	scopes: [Scopes.Customers.Write],
});
