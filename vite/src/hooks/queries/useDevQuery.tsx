import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useDevQuery = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const fetcher = async () => {
		try {
			const { data } = await axiosInstance.get("/dev/data");
			return data;
		} catch (error) {
			return null;
		}
	};
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(["dev"]),
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
