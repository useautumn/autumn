import { useAxiosInstance } from "@/services/useAxiosInstance";
import { Feature } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";

export const useFeaturesQuery = () => {
  const axiosInstance = useAxiosInstance();

  const fetchFeatures = async () => {
    const { data } = await axiosInstance.get("/products/features");
    return data;
  };

  const { data, isLoading, error, refetch } = useQuery<{
    features: Feature[];
  }>({
    queryKey: ["features"],
    queryFn: fetchFeatures,
  });

  return { features: data?.features || [], isLoading, error, mutate: refetch };
};
