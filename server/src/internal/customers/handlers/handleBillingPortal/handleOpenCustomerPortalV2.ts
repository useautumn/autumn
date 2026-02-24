import {
	CustomerNotFoundError,
	OpenCustomerPortalParamsV1Schema,
} from "@autumn/shared";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { CusService } from "../../CusService";
import { createBillingPortalSession } from "./createBillingPortalSession";

export const handleOpenCustomerPortalV2 = createRoute({
	body: OpenCustomerPortalParamsV1Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;

		const {
			customer_id: customerId,
			configuration_id: configurationId,
			return_url: returnUrl,
		} = c.req.valid("json");

		const customer = await CusService.get({
			db,
			idOrInternalId: customerId,
			orgId: org.id,
			env,
		});

		if (!customer) {
			throw new CustomerNotFoundError({ customerId });
		}

		const session = await createBillingPortalSession({
			ctx,
			customer,
			returnUrl,
			configurationId,
		});

		return c.json({
			customer_id: customer.id || null,
			url: session.url,
		});
	},
});
