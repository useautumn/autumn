import type {
	ApiEventsListItem,
	ApiEventsListResponse,
	CursorPaginatedResponse,
} from "@autumn/shared";
import {
	AffectedResource,
	ApiEventsListParamsSchema,
	ApiEventsListV2_3ParamsSchema,
	ApiVersion,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { eventActions } from "@/internal/analytics/actions/eventActions.js";

export const handleExternalListEvents = createRoute({
	scopes: [Scopes.Analytics.Read],
	resource: AffectedResource.Event,
	versionedBody: {
		latest: ApiEventsListV2_3ParamsSchema,
		[ApiVersion.V2_2]: ApiEventsListParamsSchema,
	},
	versionedHandler: {
		latest: async (c) => {
			const ctx = c.get("ctx");
			const body = c.req.valid("json");

			const featureIds = body.feature_id
				? Array.isArray(body.feature_id)
					? body.feature_id
					: [body.feature_id]
				: undefined;

			const result = await eventActions.listByCursor({
				ctx,
				params: {
					customer_id: body.customer_id,
					entity_id: body.entity_id,
					feature_ids: featureIds,
					custom_range: body.custom_range,
					start_cursor: body.start_cursor,
					limit: body.limit,
					filter_by: body.filter_by,
				},
			});

			return c.json<CursorPaginatedResponse<ApiEventsListItem>>(result);
		},
		[ApiVersion.V2_2]: async (c) => {
			const ctx = c.get("ctx");
			const body = c.req.valid("json");

			const featureIds = body.feature_id
				? Array.isArray(body.feature_id)
					? body.feature_id
					: [body.feature_id]
				: undefined;

			const result = await eventActions.listEvents({
				ctx,
				params: {
					customer_id: body.customer_id,
					entity_id: body.entity_id,
					feature_ids: featureIds,
					custom_range: body.custom_range,
					offset: body.offset,
					limit: body.limit,
					filter_by: body.filter_by,
				},
			});

			return c.json<ApiEventsListResponse>(result);
		},
	},
});
