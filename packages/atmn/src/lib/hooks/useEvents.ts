import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { request } from "../api/client.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/keys.js";

/**
 * Event item from the API
 */
export interface ApiEventsListItem {
	id: string;
	timestamp: number;
	feature_id: string;
	customer_id: string;
	value: number;
	properties: Record<string, unknown>;
}

/**
 * Response from POST /v1/events/list
 */
export interface ListEventsResponse {
	list: ApiEventsListItem[];
	has_more: boolean;
	offset: number;
	limit: number;
	/** Number of items in CURRENT PAGE only, NOT total in DB */
	total: number;
}

/**
 * Time range presets for filtering events
 */
export type TimeRangePreset = "24h" | "7d" | "30d" | "90d" | "all" | "custom";

/**
 * Custom time range with start/end timestamps
 */
export interface CustomTimeRange {
	start?: number;
	end?: number;
}

/**
 * Get timestamp for time range preset
 */
export function getTimeRangeStart(preset: TimeRangePreset): number | undefined {
	if (preset === "all") return undefined;
	if (preset === "custom") return undefined;

	const now = Date.now();
	const ms = {
		"24h": 24 * 60 * 60 * 1000,
		"7d": 7 * 24 * 60 * 60 * 1000,
		"30d": 30 * 24 * 60 * 60 * 1000,
		"90d": 90 * 24 * 60 * 60 * 1000,
	};

	return now - ms[preset];
}

export interface UseEventsOptions {
	page: number;
	pageSize?: number;
	environment?: AppEnv;
	/** Filter by customer ID */
	customerId?: string;
	/** Filter by single feature ID (string) or multiple feature IDs (array) */
	featureId?: string | string[];
	/** Time range preset */
	timeRange?: TimeRangePreset;
	/** Custom time range (when timeRange === "custom") */
	customRange?: CustomTimeRange;
}

/**
 * TanStack Query hook for fetching paginated events
 */
export function useEvents({
	page,
	pageSize = 50,
	environment = AppEnv.Sandbox,
	customerId,
	featureId,
	timeRange = "all",
	customRange,
}: UseEventsOptions) {
	const offset = (page - 1) * pageSize;

	return useQuery({
		queryKey: [
			"events",
			{
				offset,
				limit: pageSize,
				environment,
				customerId,
				featureId,
				timeRange,
				customRange,
			},
		],
		queryFn: async () => {
			const secretKey = getKey(environment);

			const body: Record<string, unknown> = {
				limit: pageSize,
				offset,
			};

			// Add optional filters if provided
			if (customerId) {
				body["customer_id"] = customerId;
			}
			if (featureId) {
				body["feature_id"] = featureId;
			}

			// Add time range filter
			if (timeRange === "custom" && customRange) {
				body["custom_range"] = customRange;
			} else if (timeRange !== "all") {
				const start = getTimeRangeStart(timeRange);
				if (start) {
					body["custom_range"] = { start };
				}
			}

			const response = await request<ListEventsResponse>({
				method: "POST",
				path: "/v1/events/list",
				secretKey,
				body,
			});

			return response;
		},
		placeholderData: keepPreviousData,
		staleTime: 30_000,
	});
}
