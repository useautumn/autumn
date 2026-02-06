import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";

type IntervalType = "7d" | "30d" | "90d";

export const useCusEventsQuery = ({
	interval,
	limit,
}: {
	interval?: IntervalType;
	limit?: number;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const { customer_id } = useParams();

	const fetcher = async () => {
		const params = new URLSearchParams();
		if (interval) params.set("interval", interval);
		if (limit) params.set("limit", limit.toString());

		const queryString = params.toString();
		const url = `/customers/${customer_id}/events${queryString ? `?${queryString}` : ""}`;

		const { data } = await axiosInstance.get(url);
		return data;
	};

	const { data, isLoading, error } = useQuery({
		queryKey: ["customer_events", customer_id, interval, limit],
		queryFn: fetcher,
	});

	return { events: data?.events, isLoading, error };
};
