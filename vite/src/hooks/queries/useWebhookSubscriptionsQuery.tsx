import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** Which of `eventTypes` the org has a webhook endpoint listening for. */
export const useWebhookSubscriptionsQuery = ({
	eventTypes,
}: {
	eventTypes: string[];
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const eventTypesParam = eventTypes.join(",");

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(["webhook_subscriptions", eventTypesParam]),
		enabled: eventTypes.length > 0,
		queryFn: async () => {
			const { data }: { data: { subscribed_event_types: string[] } } =
				await axiosInstance.get("/dev/webhook_subscriptions", {
					params: { event_types: eventTypesParam },
				});
			return data;
		},
	});

	return {
		subscribedEventTypes: data?.subscribed_event_types ?? [],
		isSubscribed: (data?.subscribed_event_types.length ?? 0) > 0,
		isLoading,
		error,
		refetch,
	};
};
