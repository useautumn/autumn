import type { AggregatedEventRow, ProcessedEventRow } from "@autumn/shared";
import {
	AffectedResource,
	applyResponseVersionChanges,
	CustomerNotFoundError,
	ErrCode,
	EventsAggregateParamsSchema,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { sanitizeTimezone } from "@/internal/analytics/actions/aggregate.js";
import { aggregateDeductions } from "@/internal/analytics/actions/aggregateDeductions.js";
import { eventActions } from "@/internal/analytics/actions/eventActions.js";
import { getStandardIntervalWindow } from "@/internal/analytics/analyticsUtils.js";
import { collapsePlanIdGroups } from "@/internal/analytics/utils/collapsePlanIdGroups.js";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService.js";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import {
	backfillMissingGroupValues,
	buildGroupedTimeseries,
	collectGroupingMetadata,
	convertPeriodsToEpoch,
} from "../eventUtils.js";

export const handleExternalAggregateEvents = createRoute({
	scopes: [Scopes.Analytics.Read],
	body: EventsAggregateParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
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
			aggregate_on,
			timezone,
		} = c.req.valid("json");
		const safeTimezone = sanitizeTimezone({ timezone });

		if (aggregate_on && !customer_id) {
			throw new RecaseError({
				message: "customer_id is required when aggregate_on is set",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (aggregate_on && group_by === "$plan_id") {
			throw new RecaseError({
				message:
					"group_by $plan_id is not supported when aggregate_on is set — deductions already include plan_id per balance",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		// The deduction rollup carries no event properties, so it cannot honor
		// property filters — reject rather than return mismatched sections.
		if (aggregate_on && filter_by && Object.keys(filter_by).length > 0) {
			throw new RecaseError({
				message: "filter_by is not supported when aggregate_on is set",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		let customer: Awaited<ReturnType<typeof CusService.getFull>> | undefined;
		let aggregateAll = false;

		if (customer_id) {
			customer = await CusService.getFull({
				ctx,
				idOrInternalId: customer_id,
				withSubs: true,
				withEntities: Boolean(aggregate_on),
			});

			if (!customer) {
				throw new CustomerNotFoundError({ customerId: customer_id });
			}
		} else {
			aggregateAll = true;
		}

		const featureIds = Array.isArray(feature_id) ? feature_id : [feature_id];
		const binSize = bin_size ?? "day";

		// Resolve standard ranges to one window so the timeseries and `total`
		// cover identical, bin-aligned spans. Billing-cycle ranges resolve per customer.
		const standardWindow = getStandardIntervalWindow({
			interval: range,
			binSize,
		});
		const customRange =
			custom_range ??
			(standardWindow && {
				start: standardWindow.start.getTime(),
				end: standardWindow.end.getTime(),
			});
		const interval = customRange ? undefined : range;

		let resolvedGroupBy = group_by;
		if (group_by === "$customer_id") {
			resolvedGroupBy = "customer_id";
		} else if (group_by === "$entity_id") {
			resolvedGroupBy = "entity_id";
		} else if (group_by === "$plan_id") {
			resolvedGroupBy = "plan_id";
		} else if (group_by === "$feature_id") {
			resolvedGroupBy = undefined;
		}

		const isPlanIdGrouping = resolvedGroupBy === "plan_id";
		const internalIdToPublicId: Record<string, string> = {};
		let planMaxGroups: number | undefined;

		// The pipe groups by internal plan id, so each version is its own group
		// until collapsed onto the public id.
		if (isPlanIdGrouping) {
			const allPlanVersions = await ProductService.listCachedAllVersions({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			for (const plan of allPlanVersions) {
				internalIdToPublicId[plan.internal_id] = plan.id;
			}
			planMaxGroups = Math.max(allPlanVersions.length + 1, max_groups ?? 0, 10);
		}

		const [eventsResult, total] = await Promise.all([
			eventActions.aggregate({
				ctx,
				params: {
					aggregateAll,
					interval,
					event_names: featureIds,
					customer_id: customer_id,
					entity_id,
					no_count: true,
					customer,
					group_by: resolvedGroupBy,
					bin_size: binSize,
					custom_range: customRange,
					enforceGroupLimit: true,
					filter_by,
					max_groups: planMaxGroups ?? max_groups,
					timezone: safeTimezone,
				},
			}),
			eventActions.getCountAndSum({
				ctx,
				params: {
					aggregateAll,
					interval,
					event_names: featureIds,
					customer_id: customer_id,
					entity_id,
					customer,
					custom_range: customRange,
					bin_size: binSize,
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

		if (isPlanIdGrouping) {
			collapsePlanIdGroups({ events, internalIdToPublicId });
		}

		const currentTime = convertPeriodsToEpoch({
			events: events.data,
			timezone: safeTimezone,
			binSize,
		});

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

		const deductions =
			aggregate_on === "deducted" && customer
				? await aggregateDeductions({
						ctx,
						params: {
							customer,
							customerId: customer_id as string,
							entityId: entity_id,
							featureIds,
							groupBy:
								group_by === "$feature_id" ? "source_feature_id" : group_by,
							interval,
							customRange,
							binSize,
							maxGroups: max_groups,
							timezone: safeTimezone,
						},
					})
				: undefined;

		const v1Response = {
			list: v1List,
			total,
			...(deductions ? { deductions } : {}),
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
