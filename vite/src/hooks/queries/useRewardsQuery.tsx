import type { AppEnv, Reward, RewardProgram } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { PERSIST_META } from "@/lib/queryPersistence";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** `env` reads another env's rewards; it defaults to the dashboard's. */
export const useRewardsQuery = ({ env }: { env?: AppEnv } = {}) => {
	const axiosInstance = useAxiosInstance({ env });
	const buildKey = useQueryKeyFactory({ env });

	const fetchRewards = async () => {
		const { data } = await axiosInstance.get("/products/rewards");
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(["rewards"]),
		queryFn: fetchRewards,
		meta: PERSIST_META,
	});

	return {
		rewards: (data?.rewards || []) as Reward[],
		rewardPrograms: (data?.rewardPrograms || []) as RewardProgram[],
		isLoading,
		error,
		refetch,
	};
};
