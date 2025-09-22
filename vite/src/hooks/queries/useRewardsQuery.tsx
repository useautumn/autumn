import type { Reward, RewardProgram } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useRewardsQuery = () => {
	const axiosInstance = useAxiosInstance();

	const fetchRewards = async () => {
		const { data } = await axiosInstance.get("/products/rewards");
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["rewards"],
		queryFn: fetchRewards,
	});

	return {
		rewards: (data?.rewards || []) as Reward[],
		rewardPrograms: (data?.rewardPrograms || []) as RewardProgram[],
		isLoading,
		error,
		refetch,
	};
};
