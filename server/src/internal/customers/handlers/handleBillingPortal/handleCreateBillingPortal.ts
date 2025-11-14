import { CustomerNotFoundError } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { CusService } from "../../CusService";
import { createBillingPortalSession } from "./createBillingPortalSession";

export const handleCreateBillingPortal = createRoute({
	query: z.object({
		return_url: z.string().optional(),
	}),
	body: z.object({
		return_url: z.string().optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");

		const { return_url: queryReturnUrl } = c.req.valid("query");
		const { return_url: bodyReturnUrl } = c.req.valid("json");
		const returnUrl = queryReturnUrl ?? bodyReturnUrl;

		const customerId = c.req.param("customer_id");

		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		if (!customer) {
			throw new CustomerNotFoundError({ customerId });
		}

		const session = await createBillingPortalSession({
			ctx,
			customer,
			returnUrl,
		});

		return c.json({
			customer_id: customer.id,
			url: session.url,
		});
	},
});
