import { z } from "zod/v4";
import { assertTinybirdAvailable } from "@/external/tinybird/tinybirdUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { eventActions } from "../actions/eventActions.js";

const ListEventNamesSchema = z.object({
	limit: z.coerce.number().optional(),
});

/**
 * List all distinct event names for the org sorted by popularity
 */
export const handleListEventNames = createRoute({
	query: ListEventNamesSchema,
	handler: async (c) => {
		assertTinybirdAvailable();
		const ctx = c.get("ctx");
		const { limit } = c.req.valid("query");

		const eventNames = await eventActions.listEventNames({
			ctx,
			limit,
		});

		return c.json({
			eventNames,
		});
	},
});
