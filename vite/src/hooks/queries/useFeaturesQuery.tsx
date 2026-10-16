import type { Feature } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { PERSIST_META } from "@/lib/queryPersistence";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useFeaturesQuery = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const fetchFeatures = async () => {
		const { data } = await axiosInstance.get("/products/features");
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery<{
		features: Feature[];
	}>({
		queryKey: buildKey(["features"]),
		queryFn: fetchFeatures,
		meta: PERSIST_META,
	});

	return {
		features: (data?.features || []) as Feature[],
		isLoading,
		error,
		refetch,
	};
};
