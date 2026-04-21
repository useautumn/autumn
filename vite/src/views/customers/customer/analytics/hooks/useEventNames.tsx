import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type EventNameWithCount = {
	event_name: string;
	event_count: number;
};

export const useEventNames = (limit?: number) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error } = useQuery({
		queryKey: buildKey(["query-event-names-list", limit]),
		queryFn: async () => {
			const url = `/query/event_names/list${limit ? `?limit=${limit}` : ""}`;
			const { data } = await axiosInstance.get(url);
			return data;
		},
	});

	return {
		eventNames: data?.eventNames ?? [],
		isLoading,
		error,
	};
};
