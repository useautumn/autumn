import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type EventNameWithCount = {
	event_name: string;
	event_count: number;
};

export const useEventNames = ({
	limit,
	interval,
	binSize,
	start,
	end,
	enabled = true,
}: {
	limit?: number;
	interval?: string;
	binSize?: string;
	start?: number | null;
	end?: number | null;
	enabled?: boolean;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error } = useQuery({
		queryKey: buildKey([
			"query-event-names-list",
			limit,
			interval,
			binSize,
			start,
			end,
		]),
		enabled,
		queryFn: async () => {
			const { data } = await axiosInstance.get("/query/event_names/list", {
				params: {
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
		error,
	};
};
