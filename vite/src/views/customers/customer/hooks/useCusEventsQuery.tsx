import { LATEST_VERSION } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { fetchEventsList } from "../analytics/api/fetchEventsList";

type IntervalType = "7d" | "30d" | "90d";

export const useCusEventsQuery = ({
	interval,
	customerId,
}: {
	interval?: IntervalType;
	customerId?: string;
} = {}) => {
	const axiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const buildKey = useQueryKeyFactory();
	const { customer_id } = useParams();

	const id = customerId ?? customer_id;

	const { data, isLoading, isFetching, error } = useQuery({
		queryKey: buildKey(["customer_events", id, interval]),
		queryFn: () =>
			fetchEventsList({
				axiosInstance,
				customerId: id,
				interval: interval ?? "30d",
			}),
		enabled: !!id,
	});

	return { events: data?.events, isLoading, isFetching, error };
};
