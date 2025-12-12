import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

interface RevenueCatConfig {
	connected: boolean;
	api_key?: string;
	sandbox_api_key?: string;
	project_id?: string;
	sandbox_project_id?: string;
	webhook_secret?: string;
	sandbox_webhook_secret?: string;
}

export const useRevenueCatQuery = () => {
	const axiosInstance = useAxiosInstance();
	const fetcher = async () => {
		try {
			const { data }: { data: RevenueCatConfig } = await axiosInstance.get(
				"/v1/organization/revenuecat",
			);
			return data;
		} catch (_error) {
			return null;
		}
	};
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["revenuecat"],
		queryFn: fetcher,
	});

	return {
		revenueCatConfig: data,
		isLoading,
		error,
		refetch,
	};
};
