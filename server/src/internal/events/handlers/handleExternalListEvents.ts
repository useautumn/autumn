import type { ApiEventsListResponse } from "@autumn/shared";
import { ApiEventsListParamsSchema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { eventActions } from "@/internal/analytics/actions/eventActions.js";

export const handleExternalListEvents = createRoute({
	body: ApiEventsListParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const validatedParams = ApiEventsListParamsSchema.parse(
			c.req.valid("json"),
		);

		const featureIds = validatedParams.feature_id
			? Array.isArray(validatedParams.feature_id)
				? validatedParams.feature_id
				: [validatedParams.feature_id]
			: undefined;

		const result = await eventActions.listEventsForApi({
			ctx,
			params: {
				customer_id: validatedParams.customer_id,
				feature_ids: featureIds,
				custom_range: validatedParams.custom_range,
				offset: validatedParams.offset,
				limit: validatedParams.limit,
			},
		});

		return c.json<ApiEventsListResponse>(result);
	},
});
