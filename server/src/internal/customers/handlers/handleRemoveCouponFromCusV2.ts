import {
	AffectedResource,
	CustomerNotFoundError,
	ErrCode,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "../CusService.js";

export const handleRemoveCouponFromCusV2 = createRoute({
	scopes: [Scopes.Billing.Write],
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { customer_id } = c.req.param();

		const customer = await CusService.get({
			db,
			idOrInternalId: customer_id,
			orgId: org.id,
			env,
		});

		if (!customer?.id) {
			throw new CustomerNotFoundError({ customerId: customer_id });
		}

		const stripeCustomerId = customer.processor?.id;

		if (!stripeCustomerId) {
			throw new RecaseError({
				message: "Customer has no Stripe customer to remove a coupon from",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const stripeCli = createStripeCli({ org, env });
		await stripeCli.customers.deleteDiscount(stripeCustomerId);

		return c.json({ customer });
	},
});
