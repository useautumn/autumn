import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { request } from "../api/client.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/keys.js";

export interface ApiEventsListItem {
	id: string;
	timestamp: number;
	feature_id: string;
	customer_id: string;
	value: number;
	properties: Record<string, unknown>;
}

export interface ListEventsResponse {
	list: ApiEventsListItem[];
	has_more: boolean;
	offset: number;
	limit: number;
	total: number;
}

export type TimeRangePreset = "24h" | "7d" | "30d" | "90d" | "all" | "custom";

export interface CustomTimeRange {
	start?: number;
	end?: number;
}

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
	customerId?: string;
	featureId?: string | string[];
	timeRange?: TimeRangePreset;
	customRange?: CustomTimeRange;
}

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

			if (customerId) {
				body["customer_id"] = customerId;
			}
			if (featureId) {
				body["feature_id"] = featureId;
			}

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
