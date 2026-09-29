import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { resolveStripeReadClient } from "../actions/stripeGet/resolveStripeReadClient.js";
import { stripeGet } from "../actions/stripeGet/stripeGet.js";

const StripeGetSchema = z
	.object({
		path: z.string().min(1),
		params: z.record(z.string(), z.unknown()).optional(),
		max_pages: z.number().int().min(1).optional(),
	})
	.strict();

export const handleStripeGet = createRoute({
	scopes: [Scopes.Billing.Read],
	body: StripeGetSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const result = await stripeGet({
			client: resolveStripeReadClient({ org: ctx.org, env: ctx.env }),
			path: body.path,
			params: body.params,
			maxPages: body.max_pages,
		});

		return c.json(result, 200);
	},
});
