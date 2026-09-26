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
	ErrCode,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { eventActions } from "@/internal/analytics/actions/eventActions.js";
import { resolveRangeToCustomRange } from "@/internal/analytics/utils/resolveRangeToCustomRange.js";

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

			if (body.range && body.custom_range) {
				throw new RecaseError({
					message: "Only one of range or custom_range may be provided",
					code: ErrCode.InvalidRequest,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}

			const customRange = body.range
				? await resolveRangeToCustomRange({
						ctx,
						range: body.range,
						customerId: body.customer_id,
						featureIds,
					})
				: body.custom_range;

			const result = await eventActions.listByCursor({
				ctx,
				params: {
					customer_id: body.customer_id,
					entity_id: body.entity_id,
					feature_ids: featureIds,
					custom_range: customRange,
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
