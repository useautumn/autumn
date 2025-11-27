import {
	CustomerNotFoundError,
	GetBillingPortalBodySchema,
	GetBillingPortalQuerySchema,
} from "@autumn/shared";
import z from "zod/v4";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { CusService } from "../../CusService";
import { createBillingPortalSession } from "./createBillingPortalSession";

export const handleCreateBillingPortal = createRoute({
	query: GetBillingPortalQuerySchema,
	params: z.object({
		customer_id: z.string(),
	}),
	body: GetBillingPortalBodySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { return_url: returnUrl } = c.req.valid("query");
		const { customer_id: customerId } = c.req.param();
		const { configuration_id: configurationId } = c.req.valid("json") ?? {};

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
