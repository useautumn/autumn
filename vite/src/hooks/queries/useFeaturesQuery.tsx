import type { Feature } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";

export const useFeaturesQuery = () => {
	const axiosInstance = useAxiosInstance();
	const env = useEnv();

	const fetchFeatures = async () => {
		const { data } = await axiosInstance.get("/products/features");
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery<{
		features: Feature[];
	}>({
		queryKey: ["features", env],
		queryFn: fetchFeatures,
	});

	return {
		features: (data?.features || []) as Feature[],
		isLoading,
		error,
		refetch,
	};
};
