import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";

export const useDevQuery = () => {
	const axiosInstance = useAxiosInstance();
	const env = useEnv();
	const fetcher = async () => {
		try {
			const { data } = await axiosInstance.get("/dev/data");
			return data;
		} catch (error) {
			return null;
		}
	};
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["dev", env],
		queryFn: fetcher,
	});

	return {
		apiKeys: data?.api_keys,
		svixDashboardUrl: data?.svix_dashboard_url,
		isLoading,
		error,
		refetch,
	};
};
