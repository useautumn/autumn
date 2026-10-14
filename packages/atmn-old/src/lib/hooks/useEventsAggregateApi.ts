import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
	fetchEventsAggregate,
	type AggregateBinSize,
	type AggregateRange,
	type ApiEventsAggregateResponse,
} from "../api/endpoints/events.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/keys.js";

export type UITimeRange = "24h" | "7d" | "30d" | "90d" | "all";

function mapTimeRangeToApiRange(timeRange: UITimeRange): AggregateRange {
	if (timeRange === "all") {
		return "90d";
	}
	return timeRange;
}

function getDefaultBinSize(timeRange: UITimeRange): AggregateBinSize {
	if (timeRange === "24h") {
		return "hour";
	}
	return "day";
}

export interface FormattedTimeBucket {
	period: number;
	label: string;
	values: Record<string, number>;
	groupedValues: Record<string, Record<string, number>>;
	groupKeys: string[];
	totalValue: number;
}

function formatAggregateResponse(
	response: ApiEventsAggregateResponse,
	binSize: AggregateBinSize,
): FormattedTimeBucket[] {
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

			if (bucket && typeof bucket === "object") {
				for (const [key, value] of Object.entries(bucket)) {
					if (key === "period") continue;
					
					if (typeof value === "number") {
						values[key] = value;
						totalValue += value;
					} else if (typeof value === "object" && value !== null) {
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
	customerId?: string;
	featureId?: string | string[];
	timeRange?: UITimeRange;
	binSize?: AggregateBinSize;
	groupBy?: string;
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

	const featureIds = featureId
		? (Array.isArray(featureId) ? featureId : [featureId])
		: [];

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

				let effectiveGroupBy = groupBy;
				if (groupBy && groupBy !== "" && !groupBy.startsWith("properties.")) {
					effectiveGroupBy = `properties.${groupBy}`;
				}

				const response = await fetchEventsAggregate({
					secretKey,
					customerId: customerId!,
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
