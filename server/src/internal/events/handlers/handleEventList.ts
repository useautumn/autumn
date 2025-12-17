import type { ApiEventsListResponse } from "@autumn/shared";
import { ApiEventsListParamsSchema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { EventListService } from "../EventListService";

export const handleEventList = createRoute({
	body: ApiEventsListParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const bodyParams = c.req.valid("json");

		const result = await EventListService.getEvents({
			ctx,
			params: bodyParams,
		});

		return c.json<ApiEventsListResponse>(result);
	},
});
