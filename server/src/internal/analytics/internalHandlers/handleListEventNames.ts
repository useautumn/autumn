import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { assertTinybirdAvailable } from "@/external/tinybird/tinybirdUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { eventActions } from "../actions/eventActions.js";

const ListEventNamesSchema = z.object({
	limit: z.coerce.number().optional(),
	interval: z.string().optional(),
});

/**
 * List all distinct event names for the org sorted by popularity
 */
export const handleListEventNames = createRoute({
	scopes: [Scopes.Analytics.Read],
	query: ListEventNamesSchema,
	handler: async (c) => {
		assertTinybirdAvailable();
		const ctx = c.get("ctx");
		const { limit, interval } = c.req.valid("query");

		const eventNames = await eventActions.listEventNames({
			ctx,
			limit,
			interval,
		});

		return c.json({
			eventNames,
		});
	},
});
