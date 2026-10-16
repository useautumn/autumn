import type { AppEnv, Feature } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { PERSIST_META } from "@/lib/queryPersistence";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** `env` reads another env's features; it defaults to the dashboard's. */
export const useFeaturesQuery = ({ env }: { env?: AppEnv } = {}) => {
	const axiosInstance = useAxiosInstance({ env });
	const buildKey = useQueryKeyFactory({ env });

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
