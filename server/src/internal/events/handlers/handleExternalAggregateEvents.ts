import type { AggregatedEventRow, ProcessedEventRow } from "@autumn/shared";
import {
	AffectedResource,
	applyResponseVersionChanges,
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
		const {
			customer_id,
			entity_id,
			feature_id,
			group_by,
			range,
			bin_size,
			custom_range,
			filter_by,
			max_groups,
		} = c.req.valid("json");

		let customer: Awaited<ReturnType<typeof CusService.getFull>> | undefined;
		let aggregateAll = false;

		if (customer_id) {
			customer = await CusService.getFull({
				ctx,
				idOrInternalId: customer_id,
				withSubs: true,
			});

			if (!customer) {
				throw new CustomerNotFoundError({ customerId: customer_id });
			}
		} else {
			aggregateAll = true;
		}

		const featureIds = Array.isArray(feature_id) ? feature_id : [feature_id];

		// Map special $-prefixed group_by operators to their column names
		let resolvedGroupBy = group_by;
		if (group_by === "$customer_id") {
			resolvedGroupBy = "customer_id";
		} else if (group_by === "$entity_id") {
			resolvedGroupBy = "entity_id";
		}

		const [eventsResult, total] = await Promise.all([
			eventActions.aggregate({
				ctx,
				params: {
					aggregateAll,
					interval: range,
					event_names: featureIds,
					customer_id: customer_id,
					entity_id,
					no_count: true,
					customer,
					group_by: resolvedGroupBy,
					bin_size: bin_size ?? "day",
					custom_range,
					enforceGroupLimit: true,
					filter_by,
					max_groups,
				},
			}),
			eventActions.getCountAndSum({
				ctx,
				params: {
					aggregateAll,
					interval: range,
					event_names: featureIds,
					customer_id: customer_id,
					entity_id,
					customer,
					custom_range,
					bin_size: bin_size ?? "day",
					filter_by,
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

		if (resolvedGroupBy) {
			const ungroupedData = usageList as ProcessedEventRow[];

			const { groupValues, featureNames } = collectGroupingMetadata(
				ungroupedData,
				resolvedGroupBy,
			);
			const grouped = buildGroupedTimeseries(ungroupedData, resolvedGroupBy);
			backfillMissingGroupValues(grouped, groupValues, featureNames);

			usageList = Array.from(grouped.values()) as AggregatedEventRow[];
		}

		let v1List: {
			period: number;
			values: Record<string, number>;
			grouped_values?: Record<string, Record<string, number>>;
		}[];

		if (resolvedGroupBy) {
			v1List = usageList.map(({ period, ...groupedValues }) => {
				const values: Record<string, number> = {};
				const grouped_values: Record<string, Record<string, number>> = {};

				for (const [featureName, featureData] of Object.entries(
					groupedValues,
				)) {
					if (typeof featureData === "object" && featureData !== null) {
						grouped_values[featureName] = featureData as Record<string, number>;
						values[featureName] = Object.values(
							featureData as Record<string, number>,
						).reduce((sum, v) => sum + v, 0);
					}
				}

				return { period, values, grouped_values };
			});
		} else {
			v1List = usageList.map(({ period, ...values }) => ({
				period,
				values: values as Record<string, number>,
			}));
		}

		const v1Response = {
			list: v1List,
			total,
		};

		const versionedResponse = applyResponseVersionChanges({
			input: v1Response,
			targetVersion: ctx.apiVersion,
			resource: AffectedResource.EventsAggregate,
			ctx,
		});

		return c.json(versionedResponse);
	},
});
