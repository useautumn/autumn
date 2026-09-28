import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type EventNameWithCount = {
	event_name: string;
	event_count: number;
};

export const useEventNames = ({
	customerId,
	entityId,
	limit,
	interval,
	binSize,
	start,
	end,
	enabled = true,
	keepPrevious = false,
}: {
	customerId?: string | null;
	entityId?: string | null;
	limit?: number;
	interval?: string;
	binSize?: string;
	start?: number | null;
	end?: number | null;
	enabled?: boolean;
	/** Show the last list while a new window loads, instead of an empty one. */
	keepPrevious?: boolean;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, isPlaceholderData, error } = useQuery({
		queryKey: buildKey([
			"query-event-names-list",
			customerId,
			entityId,
			limit,
			interval,
			binSize,
			start,
			end,
		]),
		enabled,
		placeholderData: keepPrevious ? keepPreviousData : undefined,
		queryFn: async () => {
			const { data } = await axiosInstance.get("/query/event_names/list", {
				params: {
					customer_id: customerId || undefined,
					entity_id: entityId || undefined,
					limit,
					interval,
					bin_size: binSize,
					start: start ?? undefined,
					end: end ?? undefined,
				},
			});
			return data;
		},
	});

	return {
		eventNames: data?.eventNames ?? [],
		isLoading,
		isRefreshing: isPlaceholderData,
		error,
	};
};
