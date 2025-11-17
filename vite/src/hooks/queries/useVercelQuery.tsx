import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useVercelQuery = () => {
	const axiosInstance = useAxiosInstance();
	const fetcher = async () => {
		try {
			const { data }: { data: { url: string } } = await axiosInstance.get(
				"/v1/organization/vercel_sink",
			);
			return data;
		} catch (_error) {
			return null;
		}
	};
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["vercel_sink"],
		queryFn: fetcher,
	});

	return {
		svixDashboardUrl: data?.url,
		isLoading,
		error,
		refetch,
	};
};
