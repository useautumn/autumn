import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

type IntervalType = "7d" | "30d" | "90d";

/**
 * Fetches raw events via POST /query/raw (same endpoint as the analytics page).
 */
export const useCusEventsQuery = ({
	interval,
	customerId,
}: {
	interval?: IntervalType;
	/** External customer ID override. Falls back to the internal `customer_id` URL param. */
	customerId?: string;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const { customer_id } = useParams();

	const id = customerId ?? customer_id;

	const fetcher = async () => {
		const { data } = await axiosInstance.post("/query/raw", {
			customer_id: id,
			interval: interval ?? "30d",
		});
		return data;
	};

	const { data, isLoading, isFetching, error } = useQuery({
		queryKey: buildKey(["customer_events", id, interval]),
		queryFn: fetcher,
		enabled: !!id,
	});

	return { events: data?.rawEvents?.data, isLoading, isFetching, error };
};
