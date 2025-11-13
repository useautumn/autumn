import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useCusEventsQuery = () => {
	const axiosInstance = useAxiosInstance();
	const { customer_id } = useParams();

	const fetcher = async () => {
		console.log("Fetching events for customer:", customer_id);
		const { data } = await axiosInstance.get(
			`/customers/${customer_id}/events`,
		);
		// console.log("Events:", data);
		return data;
	};

	const { data, isLoading, error } = useQuery({
		queryKey: ["customer_events", customer_id],
		queryFn: fetcher,
	});

	return { events: data?.events, isLoading, error };
};
