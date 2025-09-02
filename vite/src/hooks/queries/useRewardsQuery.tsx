import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useQuery } from "@tanstack/react-query";

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
    rewards: data?.rewards || [],
    rewardPrograms: data?.rewardPrograms || [],
    isLoading,
    error,
    refetch,
  };
};
