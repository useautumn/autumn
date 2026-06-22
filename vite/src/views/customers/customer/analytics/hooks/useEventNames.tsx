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
	start,
	end,
}: {
	limit?: number;
	interval?: string;
	start?: number | null;
	end?: number | null;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error } = useQuery({
		queryKey: buildKey(["query-event-names-list", limit, interval, start, end]),
		queryFn: async () => {
			const params = new URLSearchParams();
			if (limit) {
				params.set("limit", String(limit));
			}
			if (interval) {
				params.set("interval", interval);
			}
			if (start != null) {
				params.set("start", String(start));
			}
			if (end != null) {
				params.set("end", String(end));
			}
			const query = params.toString();
			const url = `/query/event_names/list${query ? `?${query}` : ""}`;
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
