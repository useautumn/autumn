import { GetAtomMetricsParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getAtomMetrics } from "../actions/getAtomMetrics.js";

export const handleGetAtomMetrics = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: GetAtomMetricsParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		return c.json(await getAtomMetrics({ ctx, params }));
	},
});
