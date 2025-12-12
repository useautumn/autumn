import {
	AnalyticsAggregationBodySchema,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { CusService } from "@/internal/customers/CusService";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { AnalyticsServiceV2 } from "../AnalyticsServiceV2";
import type {
	AggregatedEventRow,
	ProcessedEventRow,
} from "../analyticsTypes.js";
import {
	backfillMissingGroupValues,
	buildGroupedTimeseries,
	collectGroupingMetadata,
	convertPeriodsToEpoch,
} from "../analyticsUtils.js";

export const handleAnalyticsAggregation = createRoute({
	body: AnalyticsAggregationBodySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { customer_id, feature_id, group_by, range, bin_size, custom_range } =
			c.req.valid("json");

		const customer = await CusService.getFull({
			db,
			orgId: org.id,
			idOrInternalId: customer_id,
			env,
			withSubs: true,
		});

		if (!customer) {
			throw new RecaseError({
				message: "Customer not found",
				code: ErrCode.CustomerNotFound,
				statusCode: StatusCodes.NOT_FOUND,
			});
		}

		const featureIds = Array.isArray(feature_id) ? feature_id : [feature_id];

		const [events, total] = await Promise.all([
			AnalyticsServiceV2.getTimeseriesEvents({
				ctx,
				params: {
					aggregateAll: false,
					interval: range,
					event_names: featureIds,
					customer_id: customer_id,
					no_count: true,
					customer,
					group_by,
					bin_size,
					custom_range,
				},
			}),
			AnalyticsServiceV2.getTotalEvents({
				ctx,
				params: {
					aggregateAll: false,
					interval: range,
					event_names: featureIds,
					customer_id: customer_id,
					customer,
					custom_range,
					bin_size,
				},
			}),
		]);

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
