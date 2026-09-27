import {
	type EventsAggregateResponseV1,
	FeatureType,
	LATEST_VERSION,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getUserTimezone } from "@/views/customers/customer/analytics/utils/getUserTimezone";
import { toFilterBy, useLogsFilters } from "./useLogsFilters";

export type VolumeBin = { period: number; total: number };

/** Event totals per bin under the same filters as the list, summed across features. */
export const useLogsVolume = () => {
	const axiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const buildKey = useQueryKeyFactory();
	const { filters } = useLogsFilters();
	const { features, isLoading: featuresLoading } = useFeaturesQuery();

	const timezone = useMemo(() => getUserTimezone(), []);
	const binSize = filters.range === "24h" ? "hour" : "day";
	const featureIds = useMemo(
		() =>
			filters.feature_id
				? [filters.feature_id]
				: features
						.filter((f) => f.type !== FeatureType.Boolean && !f.archived)
						.map((f) => f.id),
		[filters.feature_id, features],
	);

	const { data, isLoading } = useQuery({
		queryKey: buildKey([
			"logs-volume",
			filters.customer_id,
			filters.range,
			...filters.properties,
			timezone,
			...featureIds,
		]),
		enabled: !featuresLoading && featureIds.length > 0,
		queryFn: async () => {
			const { data } = await axiosInstance.post<EventsAggregateResponseV1>(
				"/v1/events.aggregate",
				{
					customer_id: filters.customer_id || undefined,
					feature_id: featureIds,
					range: filters.range,
					bin_size: binSize,
					timezone,
					filter_by: toFilterBy({ properties: filters.properties }),
				},
			);
			return data;
		},
		refetchInterval: filters.live ? 30_000 : false,
	});

	const bins: VolumeBin[] = useMemo(
		() =>
			(data?.list ?? []).map((item) => ({
				period: item.period,
				total: Object.values(item.values).reduce((sum, v) => sum + v, 0),
			})),
		[data],
	);

	return { bins, binSize, isLoading: featuresLoading || isLoading };
};
