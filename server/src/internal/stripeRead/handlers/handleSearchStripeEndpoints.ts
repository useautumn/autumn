import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getStripeEndpointSearch } from "../actions/searchStripeEndpoints/getStripeEndpointSearch.js";

const SearchStripeEndpointsSchema = z
	.object({
		query: z.string().min(1).max(500),
		limit: z.number().int().min(1).max(50).optional(),
	})
	.strict();

export const handleSearchStripeEndpoints = createRoute({
	scopes: [Scopes.Billing.Read],
	body: SearchStripeEndpointsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const search = getStripeEndpointSearch();
		return c.json(await search({ query: body.query, limit: body.limit }), 200);
	},
});
