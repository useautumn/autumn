import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** Svix portal links are minted per call, so only the webhooks tab asks for one. */
export const useWebhooksPortalQuery = ({ enabled }: { enabled: boolean }) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading } = useQuery({
		queryKey: buildKey(["webhooks-portal"]),
		queryFn: async () => {
			const { data } = await axiosInstance.get<{
				svix_dashboard_url: string | null;
			}>("/dev/webhooks_portal");
			return data;
		},
		enabled,
	});

	return { svixDashboardUrl: data?.svix_dashboard_url, isLoading };
};
