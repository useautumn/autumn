import type { AggregatedEventRow, ProcessedEventRow } from "@autumn/shared";
import {
	CustomerNotFoundError,
	ErrCode,
	EventsAggregateParamsSchema,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { eventActions } from "@/internal/analytics/actions/eventActions.js";
import { CusService } from "@/internal/customers/CusService";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import {
	backfillMissingGroupValues,
	buildGroupedTimeseries,
	collectGroupingMetadata,
	convertPeriodsToEpoch,
} from "../eventUtils.js";

export const handleExternalAggregateEvents = createRoute({
	body: EventsAggregateParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { customer_id, feature_id, group_by, range, bin_size, custom_range } =
			c.req.valid("json");

		console.log("handleAggregateEvents", {
			customer_id,
			feature_id,
			group_by,
			range,
			bin_size,
			custom_range,
		});

		const customer = await CusService.getFull({
			db,
			orgId: org.id,
			idOrInternalId: customer_id,
			env,
			withSubs: true,
		});

		if (!customer) {
			throw new CustomerNotFoundError({ customerId: customer_id });
		}

		const featureIds = Array.isArray(feature_id) ? feature_id : [feature_id];

		const [eventsResult, total] = await Promise.all([
			eventActions.aggregate({
				ctx,
				params: {
					aggregateAll: false,
					interval: range,
					event_names: featureIds,
					customer_id: customer_id,
					no_count: true,
					customer,
					group_by,
					bin_size: bin_size ?? "day",
					custom_range,
					enforceGroupLimit: true,
				},
			}),
			eventActions.getCountAndSum({
				ctx,
				params: {
					aggregateAll: false,
					interval: range,
					event_names: featureIds,
					customer_id: customer_id,
					customer,
					custom_range,
					bin_size: bin_size ?? "day",
				},
			}),
		]);

		const events = eventsResult.formatted;

		if (!events) {
			throw new RecaseError({
				message: "No events found",
				code: ErrCode.InternalError,
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
			});
		}

		const currentTime = convertPeriodsToEpoch(events.data);

		let usageList = (events.data as ProcessedEventRow[]).filter(
			(event) => event.period <= currentTime,
		) as AggregatedEventRow[];

		if (group_by) {
			const ungroupedData = usageList as ProcessedEventRow[];

			const { groupValues, featureNames } = collectGroupingMetadata(
				ungroupedData,
				group_by,
			);
			const grouped = buildGroupedTimeseries(ungroupedData, group_by);
			backfillMissingGroupValues(grouped, groupValues, featureNames);

			usageList = Array.from(grouped.values()) as AggregatedEventRow[];
		}

		return c.json({
			list: usageList,
			total,
		});
	},
});
