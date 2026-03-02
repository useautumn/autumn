import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";

type IntervalType = "7d" | "30d" | "90d";

export const useCusEventsQuery = ({
	interval,
	limit,
	customerId,
}: {
	interval?: IntervalType;
	limit?: number;
	/** External customer ID override. Falls back to the internal `customer_id` URL param. */
	customerId?: string;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const { customer_id } = useParams();

	const id = customerId ?? customer_id;

	const fetcher = async () => {
		const params = new URLSearchParams();
		if (interval) params.set("interval", interval);
		if (limit) params.set("limit", limit.toString());

		const queryString = params.toString();
		const url = `/customers/${id}/events${queryString ? `?${queryString}` : ""}`;

		const { data } = await axiosInstance.get(url);
		return data;
	};

	const { data, isLoading, isFetching, error } = useQuery({
		queryKey: ["customer_events", id, interval, limit],
		queryFn: fetcher,
		enabled: !!id,
	});

	return { events: data?.events, isLoading, isFetching, error };
};
