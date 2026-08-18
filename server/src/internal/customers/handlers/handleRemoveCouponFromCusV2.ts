import {
	AffectedResource,
	CustomerNotFoundError,
	Scopes,
} from "@autumn/shared";
import type Stripe from "stripe";
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
			return c.json({ customer });
		}

		const stripeCli = createStripeCli({ org, env });
		const stripeCustomer = (await stripeCli.customers.retrieve(
			stripeCustomerId,
		)) as Stripe.Customer;

		if (stripeCustomer.discount) {
			await stripeCli.customers.deleteDiscount(stripeCustomerId);
		}

		return c.json({ customer });
	},
});
