import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
	fetchEventsAggregate,
	type AggregateBinSize,
	type AggregateRange,
	type ApiEventsAggregateResponse,
} from "../api/endpoints/events.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/keys.js";

/**
 * Map UI time range presets to API range values
 */
export type UITimeRange = "24h" | "7d" | "30d" | "90d" | "all";

/**
 * Convert UI time range to API range
 * "all" maps to "90d" as a reasonable default
 */
function mapTimeRangeToApiRange(timeRange: UITimeRange): AggregateRange {
	if (timeRange === "all") {
		return "90d";
	}
	return timeRange;
}

/**
 * Get default bin size based on time range
 */
function getDefaultBinSize(timeRange: UITimeRange): AggregateBinSize {
	if (timeRange === "24h") {
		return "hour";
	}
	return "day";
}

/**
 * Formatted time bucket for display in charts
 */
export interface FormattedTimeBucket {
	period: number;
	label: string;
	/** Feature values (when not grouped) or summed values (when grouped) */
	values: Record<string, number>;
	/** Group breakdown per feature (when groupBy is used) */
	groupedValues: Record<string, Record<string, number>>;
	/** All unique group keys found in this bucket */
	groupKeys: string[];
	totalValue: number;
}

/**
 * Parse and format the aggregate response for display
 * New API shape: { list: [...], total: {...} }
 * Preserves grouped data structure for stacked chart rendering
 */
function formatAggregateResponse(
	response: ApiEventsAggregateResponse,
	binSize: AggregateBinSize,
): FormattedTimeBucket[] {
	// Defensive check - ensure list array exists
	if (!response?.list || !Array.isArray(response.list)) {
		return [];
	}

	return response.list
		.filter((bucket) => bucket != null && bucket.period != null)
		.map((bucket) => {
			const periodTimestamp = Number(bucket.period);
			const values: Record<string, number> = {};
			const groupedValues: Record<string, Record<string, number>> = {};
			const groupKeysSet = new Set<string>();
			let totalValue = 0;

			// Defensive check for bucket entries
			if (bucket && typeof bucket === "object") {
				for (const [key, value] of Object.entries(bucket)) {
					if (key === "period") continue;
					
					if (typeof value === "number") {
						values[key] = value;
						totalValue += value;
					} else if (typeof value === "object" && value !== null) {
						// Grouped values - preserve the breakdown
						const groupData = value as Record<string, number>;
						groupedValues[key] = groupData;
						
						let groupSum = 0;
						for (const [groupKey, groupVal] of Object.entries(groupData)) {
							groupKeysSet.add(groupKey);
							if (typeof groupVal === "number") {
								groupSum += groupVal;
							}
						}
						values[key] = groupSum;
						totalValue += groupSum;
					}
				}
			}

			return {
				period: periodTimestamp,
				label: formatPeriodLabel(periodTimestamp, binSize),
				values,
				groupedValues,
				groupKeys: Array.from(groupKeysSet).sort(),
				totalValue,
			};
		});
}

/**
 * Format period timestamp to human-readable label
 */
function formatPeriodLabel(timestamp: number, binSize: AggregateBinSize): string {
	const date = new Date(timestamp);

	switch (binSize) {
		case "hour":
			return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:00`;
		case "day":
			return `${date.getMonth() + 1}/${date.getDate()}`;
		case "month":
			return `${date.getMonth() + 1}/${date.getFullYear().toString().slice(2)}`;
	}
}

export interface UseEventsAggregateApiOptions {
	environment?: AppEnv;
	/** Customer ID (required for API - query disabled if not provided) */
	customerId?: string;
	/** Feature ID(s) to aggregate (required for API - query disabled if not provided) */
	featureId?: string | string[];
	/** Time range preset */
	timeRange?: UITimeRange;
	/** Bin size for time buckets */
	binSize?: AggregateBinSize;
	/** Property to group by (must start with "properties.") */
	groupBy?: string;
	/** Whether the query is enabled (in addition to customerId/featureId checks) */
	enabled?: boolean;
}

export interface UseEventsAggregateApiResult {
	data: FormattedTimeBucket[] | undefined;
	totals: Record<string, { count: number; sum: number }> | undefined;
	raw: ApiEventsAggregateResponse | undefined;
	isLoading: boolean;
	isError: boolean;
	error: Error | null;
	refetch: () => void;
	isFetching: boolean;
}

/**
 * Hook to fetch aggregated events from the external API
 * Uses /v1/events/aggregate endpoint
 * REQUIRES customer_id and feature_id - query is disabled if either is missing
 */
export function useEventsAggregateApi({
	environment = AppEnv.Sandbox,
	customerId,
	featureId,
	timeRange = "7d",
	binSize,
	groupBy,
	enabled = true,
}: UseEventsAggregateApiOptions): UseEventsAggregateApiResult {
	const effectiveBinSize = binSize ?? getDefaultBinSize(timeRange);
	const range = mapTimeRangeToApiRange(timeRange);

	// Normalize featureId to array for consistent handling
	const featureIds = featureId
		? (Array.isArray(featureId) ? featureId : [featureId])
		: [];

	// API requires both customerId and featureId
	const hasRequiredParams = !!customerId && customerId !== "" && featureIds.length > 0;

	const query = useQuery({
		queryKey: [
			"events-aggregate",
			{
				environment,
				customerId,
				featureId: featureIds,
				range,
				binSize: effectiveBinSize,
				groupBy,
			},
		],
		queryFn: async () => {
			try {
				const secretKey = getKey(environment);

				// Ensure groupBy has "properties." prefix if provided
				let effectiveGroupBy = groupBy;
				if (groupBy && groupBy !== "" && !groupBy.startsWith("properties.")) {
					effectiveGroupBy = `properties.${groupBy}`;
				}

				const response = await fetchEventsAggregate({
					secretKey,
					customerId: customerId!, // Safe - checked in enabled
					featureId: featureIds,
					range,
					binSize: effectiveBinSize,
					groupBy: effectiveGroupBy && effectiveGroupBy !== "" ? effectiveGroupBy : undefined,
				});

				return response;
			} catch (err) {
				console.error("Error fetching events aggregate:", err);
				throw err;
			}
		},
		enabled: enabled && hasRequiredParams,
		placeholderData: keepPreviousData,
		staleTime: 30_000,
	});

	let formattedData: FormattedTimeBucket[] | undefined;
	let totals: Record<string, { count: number; sum: number }> | undefined;

	try {
		formattedData = query.data
			? formatAggregateResponse(query.data, effectiveBinSize)
			: undefined;
	} catch (err) {
		console.error("Error formatting aggregate response:", err);
		formattedData = undefined;
	}

	// Use totals directly from API response (new API shape)
	try {
		totals = query.data?.total;
	} catch (err) {
		console.error("Error getting totals:", err);
		totals = undefined;
	}

	return {
		data: formattedData,
		totals,
		raw: query.data,
		isLoading: query.isLoading,
		isError: query.isError,
		error: query.error,
		refetch: query.refetch,
		isFetching: query.isFetching,
	};
}
